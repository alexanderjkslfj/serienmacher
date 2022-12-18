import natives from "./natives.mjs"

/**
 * Types of values (which may use different methods for serialization/deserialization)
 */
enum valueType {
    JSONREADY,
    COMPLEX,
    BIGINT,
    SYMBOL,
    UNDEFINED,
    NATIVE
}

/**
 * Types of complex objects (used at construction)
 */
enum objectType {
    NORMAL,
    FUNCTION,
    ARRAY
}

/**
 * Serialize data. Supports everything except:
 *  - non-pure functions
 *  - non-native symbols
 *  - objects relying on fundamentally non-serializable things:
 *      - Blobs
 *      - Workers
 *      - etc.
 * 
 * Warning: Everything (except native objects) will be serialized, as deep as possible. This can lead to huge strings of data, even for small objects.
 * @param something Data to be serialized.
 * @returns Data serialized as a string.
 */
export function serialize(something: any): string {
    const type = getValueType(something)

    return JSON.stringify([type, (type === valueType.COMPLEX)
        ? serializeComplex(something)
        : serializeBasic(type, something)
    ])
}

/**
 * Deserialize data.
 * @param something Data to be deserialized.
 * @returns Deserialized data.
 */
export function deserialize(something: string): any {
    const [type, value]: [valueType, string | (serializedObject | number)[]] = JSON.parse(something)
    return (type === valueType.COMPLEX)
        ? parseComplex(value as (serializedObject | number)[])
        : parseBasic(type, value as string)
}

type TypedBasic<T> =
    (T extends valueType.NATIVE ? object :
        (T extends valueType.BIGINT ? bigint :
            (T extends valueType.SYMBOL ? symbol :
                (T extends valueType.UNDEFINED ? undefined :
                    (null | string | number | boolean)))))

/**
 * Parse basic data
 * @param type type of data (which method to use for parsing)
 * @param value 
 * @returns 
 */
function parseBasic<T extends valueType>(type: T, value: string): TypedBasic<T> {
    switch (type) {
        case valueType.JSONREADY:
            return JSON.parse(value)
        case valueType.BIGINT:
            // @ts-ignore
            return BigInt(value)
        case valueType.SYMBOL:
            return Symbol[value]
        case valueType.UNDEFINED:
            return undefined
        case valueType.NATIVE:
            return natives[value]
    }
}

/**
 * Serialize basic data
 * @param type type of data (which method to use for serialization)
 * @param basic
 * @returns string describing the data
 */
function serializeBasic<T extends valueType>(type: T, basic: TypedBasic<T>): string {
    switch (type) {
        case valueType.JSONREADY:
            return JSON.stringify(basic)
        case valueType.BIGINT:
            return basic.toString()
        case valueType.SYMBOL:
            return findSymbol(basic as symbol)
        case valueType.UNDEFINED:
            return ""
        case valueType.NATIVE:
            return findNativeIndex(basic as object).toString()
    }
    console.error("Invalid parameter passed to basic2str:", basic)
    throw "ParameterError"
}

/**
 * Parse complex data
 * @param value 
 * @returns 
 */
function parseComplex(value: (serializedObject | number)[]): object {
    const input = value
    const output: object[] = []

    for (const object of input) {
        if (typeof object === "number") {
            output.push(natives[object])
        } else {
            switch (object.type) {
                case objectType.NORMAL:
                    output.push({})
                    break
                case objectType.ARRAY:
                    output.push([])
                    break
                case objectType.FUNCTION:
                    output.push(parseFunctionString(object.fun))
                    break
                default:
                    throw `Invalid complex type: ${object.type}`
            }
        }
    }

    for (let i = 0; i < input.length; i++) {
        if (typeof input[i] === "number")
            continue

        for (const prop of (input[i] as serializedObject).props) {

            const key = prop.key.symbol ? Symbol[prop.key.value] : prop.key.value

            const existingDescriptor = Object.getOwnPropertyDescriptor(output[i], key)
            if (existingDescriptor !== undefined && existingDescriptor.configurable === false)
                continue

            const descriptor: PropertyDescriptor = {
                configurable: prop.descriptor.configurable,
                enumerable: prop.descriptor.enumerable
            }

            if (prop.descriptor.set !== -1)
                descriptor.set = output[prop.descriptor.set] as () => any

            if (prop.descriptor.get !== -1)
                descriptor.get = output[prop.descriptor.get] as () => any

            if (prop.descriptor.set === -1 && prop.descriptor.get === -1) {
                descriptor.writable = prop.descriptor.writable
                descriptor.value = (prop.type === valueType.COMPLEX)
                    ? output[prop.descriptor.value]
                    : parseBasic(prop.type, prop.descriptor.value as string)
            }

            Object.defineProperty(output[i], key, descriptor)
        }

        Object.setPrototypeOf(output[i], ((input[i] as serializedObject).proto.native)
            ? natives[(input[i] as serializedObject).proto.index]
            : output[(input[i] as serializedObject).proto.index]
        )
    }

    return output[0]
}

/**
 * Serialize complex data
 * @param complex 
 * @returns 
 */
function serializeComplex(complex: object): (serializedObject | number)[] {
    const parsed: (serializedObject | number)[] = []
    const objects: object[] = [complex]

    function findOrAddObject(object: object): number {
        let valueIndex = objects.findIndex(o => o === object)
        if (valueIndex === -1) {
            objects.push(object)
            return objects.length - 1
        } else {
            return valueIndex
        }
    }

    for (let serialized = 0; serialized < objects.length; serialized++) {
        const current = objects[serialized]

        const nativeIndex = findNativeIndex(current)
        if (nativeIndex !== -1) {
            parsed.push(nativeIndex)
            continue
        }

        const type: objectType = (Array.isArray(current))
            ? objectType.ARRAY
            : (typeof current === "function")
                ? objectType.FUNCTION
                : objectType.NORMAL

        const proto = Object.getPrototypeOf(current)
        let nativeProto = true
        let protoIndex = findNativeIndex(proto)
        if (protoIndex === -1) {
            nativeProto = false
            protoIndex = findOrAddObject(proto)
        }

        const p: serializedObject = {
            type: type,
            fun: (type === objectType.FUNCTION) ? getFunctionString(current as CallableFunction) : null,
            proto: {
                native: nativeProto,
                index: protoIndex
            },
            props: []
        }

        for (const key of Reflect.ownKeys(current)) {
            const rawDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(current, key)!

            const symbolName = (typeof key === "symbol") ? tryFindSymbol(key) : ""

            if (symbolName === null)
                continue

            const getter = rawDescriptor.get
            const setter = rawDescriptor.set

            const getterIndex = (typeof getter === "function")
                ? findOrAddObject(getter)
                : -1

            const setterIndex = (typeof setter === "function")
                ? findOrAddObject(setter)
                : -1

            const value = rawDescriptor.value
            const type = getValueType(value)

            let valueIndex = (type === valueType.COMPLEX)
                ? findOrAddObject(value)
                : -1

            const descriptor: propertyDescriptor = {
                configurable: (typeof rawDescriptor.configurable === "boolean") ? rawDescriptor.configurable : true,
                enumerable: (typeof rawDescriptor.enumerable === "boolean") ? rawDescriptor.enumerable : false,
                writable: (typeof rawDescriptor.writable === "boolean") ? rawDescriptor.writable : true,
                get: getterIndex,
                set: setterIndex,
                value: (getterIndex === -1 && setterIndex === -1)
                    ? ((valueIndex === -1) ? serializeBasic(type, value) : valueIndex)
                    : -1
            }

            p.props.push({
                key: {
                    symbol: typeof key === "symbol",
                    value: (typeof key === "symbol") ? findSymbol(key) : key
                },
                type: type,
                descriptor: descriptor
            })

        }

        parsed.push(p)
    }

    return parsed

}

/**
 * Check which type of value the given value is
 * @param value value to check type of
 * @returns type of value
 */
function getValueType(value: unknown): valueType {
    if (value === null || ["string", "number", "boolean"].includes(typeof value))
        return valueType.JSONREADY

    switch (typeof value) {
        case "bigint":
            return valueType.BIGINT
        case "symbol":
            return valueType.SYMBOL
        case "undefined":
            return valueType.UNDEFINED
        default: {
            const isNative = findNativeIndex(value as object) !== -1

            return isNative
                ? valueType.NATIVE
                : valueType.COMPLEX
        }
    }

}

/**
 * A complex object in serialized form
 */
type serializedObject = {
    type: objectType,
    fun: string | null,
    proto: proto,
    props: property[]
}

/**
 * Index of the prototype and whether it's native
 */
type proto = {
    native: boolean,
    index: number
}

/**
 * Data of an object property
 */
type property = {
    key: {
        symbol: boolean
        value: string
    },
    type: valueType,
    descriptor: propertyDescriptor
}

/**
 * Descriptor of an object property
 */
type propertyDescriptor = {
    configurable: boolean,
    writable: boolean,
    enumerable: boolean,
    value: string | number,
    get: number,
    set: number
}

/**
 * Find index of object in natives array
 * @param object the object to find the index of
 * @returns the index of the object or -1 if it's not found
 */
function findNativeIndex(object: object): number {
    return natives.findIndex((native: object) => native === object)
}

/**
 * Get native name of symbol
 * @param symbol the symbol to find the native name of
 * @returns the native name of the symbol
 */
function tryFindSymbol(symbol: symbol): string | null {
    const key = Object.getOwnPropertyNames(Symbol).find(value => Symbol[value] === symbol)
    return (key === undefined) ? null : key
}

/**
 * Get native name of symbol
 * @param symbol the symbol to find the native name of
 * @returns the native name of the symbol
 * @throws if the symbol does not exist in the native Symbol object
 */
function findSymbol(symbol: symbol): string {
    const key = Object.getOwnPropertyNames(Symbol).find(value => Symbol[value] === symbol)
    if (key === undefined)
        throw "Unknown symbol"
    return key
}

/**
 * Stringify a function or class
 * @param object function or class to stringify
 * @returns a string representing the function or class
 */
function getFunctionString(object: CallableFunction): string {
    return object.toString()
}

/**
 * Turn a stringified function or class into an object
 * @param str stringified function or class
 * @returns a function or class (null on parsing error)
 */
function parseFunctionString(str: string): CallableFunction | null {
    const isClass = str.match(/^\s*class/) !== null

    try {

        if (isClass) { // parse class using eval

            let a: CallableFunction;

            eval(`a = ${str}`)

            return a

        } else { // disassemble function to avoid using eval

            // disassemble function
            const paramstr = str.match(/(?<=^[^(]*\()[^)]*/)?.[0]
            if (typeof paramstr !== "string")
                return null
            const params = [...paramstr.matchAll(/[^\s,]/g)].map(param => param[0])
            const fun = str.match(/(?<=^[^{]*{)[^]*(?=}[^}]*$)/)?.[0]
            if (typeof fun !== "string")
                return null

            // create and return function
            return Function(...params, fun)

        }

    } catch {
        return null
    }
}