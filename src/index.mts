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
    ARRAY,
    FUNCTION,
    BLOB
}

enum keyType {
    STRING,
    NATIVE_SYMBOL,
    CUSTOM_SYMBOL
}

/**
 * A basic value, relative to its valueType
 */
type TypedBasic<T> =
    (T extends valueType.NATIVE ? object :
        (T extends valueType.BIGINT ? bigint :
            (T extends valueType.SYMBOL ? symbol :
                (T extends valueType.UNDEFINED ? undefined :
                    (null | string | number | boolean)))))

/**
 * List of serialized objects and native indexes.
 */
type serializedList = (serializedObject<any> | number)[]

/**
 * Representation of a serialized complex object.
 * Contains a list of serialized and native objects as well as a list of symbol descriptions
 */
type serializedComplex = {
    objects: serializedList,
    symbols: (string | null)[]
}

/**
 * An object in serialized form, part of a serialized complex
 */
type serializedObject<type extends objectType> = {
    type: type,
    data: specialData<type>,
    proto: proto,
    props: property[]
}

type specialData<type extends objectType> = (
    type extends objectType.BLOB ? string
    : undefined)

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
    key: propkey,
    type: valueType,
    descriptor: propertyDescriptor
}

type propkey = {
    type: keyType.STRING | keyType.NATIVE_SYMBOL,
    value: string
} | {
    type: keyType.CUSTOM_SYMBOL,
    value: number
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
 * Serialize data. Supports everything except:
 *  - non-pure functions
 *  - objects relying on fundamentally non-serializable things, like Workers
 * 
 * Warning: Everything (except native objects) will be serialized, as deep and exact as possible. This can lead to huge strings of data, even for small objects.
 * @param something Data to be serialized.
 * @returns Data serialized as a string.
 */
export async function serialize(something: any): Promise<string> {
    const type = getValueType(something)

    return JSON.stringify([type, (type === valueType.COMPLEX)
        ? (await serializeComplex(something))
        : serializeBasic(type, something)
    ])
}

/**
 * Deserialize data.
 * @param something Data to be deserialized.
 * @returns Deserialized data.
 */
export function deserialize(something: string): any {
    const [type, value]: [valueType, string | serializedComplex]
        = JSON.parse(something)

    return (type === valueType.COMPLEX)
        ? parseComplex(value as serializedComplex)
        : parseBasic(type, value as string)
}

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
            // @ts-ignore
            return Symbol.for(value)
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
            return Symbol.keyFor(basic as symbol)
        case valueType.UNDEFINED:
            return ""
        case valueType.NATIVE:
            return findNativeIndex(basic as object).toString()
    }

    console.error("Invalid parameter passed to basic2str:", basic)
    throw "ParameterError"
}

function construct<T extends objectType>(type: T, data?: specialData<T>): object {
    switch (type) {
        case objectType.NORMAL:
            return {}
        case objectType.ARRAY:
            return []
        case objectType.FUNCTION:
            return parseFunctionString(data)
        case objectType.BLOB:
            return new Blob([data])
        default:
            throw `Unknown specialType: ${type}`
    }
}

/**
 * Parse complex data
 * @param value 
 * @returns 
 */
function parseComplex(value: serializedComplex): object {
    const input = value.objects
    const output: object[] = []
    const symbols: symbol[] = []

    // construct symbols
    for (const desc of value.symbols) {
        symbols.push((desc === null)
            ? Symbol()
            : Symbol(desc)
        )
    }

    // construct objects
    for (const object of input) {
        output.push((typeof object === "number")
            ? natives[object]
            : construct(object.type, object.data)
        )
    }

    // populate objects
    for (let i = 0; i < input.length; i++) {
        if (typeof input[i] === "number")
            continue

        for (const prop of (input[i] as serializedObject<any>).props) {

            let key: string | symbol
            switch (prop.key.type) {
                case keyType.STRING:
                    key = prop.key.value
                    break
                case keyType.NATIVE_SYMBOL:
                    key = Symbol.for(prop.key.value)
                    break
                case keyType.CUSTOM_SYMBOL:
                    key = symbols[prop.key.value]
            }

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

        Object.setPrototypeOf(output[i], ((input[i] as serializedObject<any>).proto.native)
            ? natives[(input[i] as serializedObject<any>).proto.index]
            : output[(input[i] as serializedObject<any>).proto.index]
        )
    }

    return output[0]
}

function getObjectType(object: object): objectType {
    if (Array.isArray(object))
        return objectType.ARRAY
    if (object instanceof Blob)
        return objectType.BLOB
    if (object instanceof Function)
        return objectType.FUNCTION
    return objectType.NORMAL
}

async function getObjectData(object: object, type: objectType): Promise<any> {
    switch (type) {
        case objectType.BLOB:
            return await (object as Blob).text()
        case objectType.FUNCTION:
            return getFunctionString(object as CallableFunction)
        case objectType.NORMAL:
        case objectType.ARRAY:
        default:
            return null
    }
}

/**
 * Serialize complex data
 * @param complex 
 * @returns 
 */
async function serializeComplex(complex: object): Promise<serializedComplex> {
    const parsed: serializedList = []
    const objects: object[] = [complex]
    const symbols: symbol[] = []

    /**
     * Get the index of an object. If not found, add it to the array.
     * @param object the object to find (or add)
     * @returns the index of the object
     */
    function findOrAddObject(object: object): number {
        return findOrAdd(objects, object)
    }

    /**
     * Get the index of a symbol. If not found, add it to the array.
     * @param sym the symbol to find (or add)
     * @returns the index of the symbol
     */
    function findOrAddSymbol(sym: symbol): number {
        return findOrAdd(symbols, sym)
    }

    /**
     * Get the index of a value. If not found, add it to the array.
     * @param value the value to find (or add)
     * @returns the index of the value
     */
    function findOrAdd<T>(list: T[], value: T): number {
        const valueIndex = list.findIndex(v => v === value)

        if (valueIndex === -1) {
            list.push(value)
            return list.length - 1
        }

        return valueIndex
    }

    // iterate over the objects (including dynamically added ones)
    for (let serialized = 0; serialized < objects.length; serialized++) {
        const current = objects[serialized]

        // check if the object is native and push its index if so
        const nativeIndex = findNativeIndex(current)
        if (nativeIndex !== -1) {
            parsed.push(nativeIndex)
            continue
        }

        // check the object's type and data
        const type = getObjectType(current)

        if(type === objectType.FUNCTION) {
            if(isNativeFunction(current as CallableFunction)) {
                natives.push(current)
                parsed.push(natives.length - 1)
                continue
            }
        }

        const data = await getObjectData(current, type)

        // get the prototype and its data
        const proto = Object.getPrototypeOf(current)

        // get the prototype's native index
        let nativeProto = true
        let protoIndex = findNativeIndex(proto)

        // if the prototype isn't native, get its object index
        if (protoIndex === -1) {
            nativeProto = false
            protoIndex = findOrAddObject(proto)
        }

        // initialize the serialized object
        const p: serializedObject<typeof type> = {
            type: type,
            data: data,
            proto: {
                native: nativeProto,
                index: protoIndex
            },
            props: []
        }

        // iterate over the properties of the object, serialize them, and add them to the serialized object
        for (const key of Reflect.ownKeys(current)) {
            const rawDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(current, key)!

            let keyt: keyType

            let keyIndex: number | string | null = null

            if (typeof key === "string") {
                keyt = keyType.STRING
            } else {
                keyIndex = Symbol.keyFor(key)

                if (keyIndex === undefined) {
                    keyIndex = findOrAddSymbol(key)
                    keyt = keyType.CUSTOM_SYMBOL
                } else {
                    keyt = keyType.NATIVE_SYMBOL
                }
            }

            const getter = rawDescriptor.get
            const setter = rawDescriptor.set

            // get the index of the getter, if it exists
            const getterIndex = (typeof getter === "function")
                ? findOrAddObject(getter)
                : -1

            // get the index of the setter, if it exists
            const setterIndex = (typeof setter === "function")
                ? findOrAddObject(setter)
                : -1

            const value = rawDescriptor.value

            // get the type of the property value
            const type = getValueType(value)

            // if the value is complex, get its index
            let valueIndex = (type === valueType.COMPLEX)
                ? findOrAddObject(value)
                : -1

            // construct a serialized descriptor
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

            let keyprop: propkey
            switch (keyt) {
                case keyType.CUSTOM_SYMBOL:
                    keyprop = {
                        type: keyType.CUSTOM_SYMBOL,
                        value: keyIndex as number
                    }
                    break
                case keyType.NATIVE_SYMBOL:
                    keyprop = {
                        type: keyType.NATIVE_SYMBOL,
                        value: keyIndex as string
                    }
                    break
                case keyType.STRING:
                    keyprop = {
                        type: keyType.STRING,
                        value: key as string
                    }
            }

            // add the serialized property to the serialized object
            p.props.push({
                key: keyprop,
                type: type,
                descriptor: descriptor
            })

        }

        parsed.push(p)
    }

    return {
        objects: parsed,
        symbols: symbols.map(sym => sym.description ?? null) as (string | null)[]
    }

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
 * Find index of object in natives array
 * @param object the object to find the index of
 * @returns the index of the object or -1 if it's not found
 */
function findNativeIndex(object: object): number {
    return natives.findIndex((native: object) => native === object)
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
            const paramstr = str.match(/(?<=^[^(]*\()[^)]*/)?.[0]                   // "(a, b) => { return a+b }" becomes "a, b"
            if (typeof paramstr !== "string") return null                           // return null if input wasn't a function
            const params = [...paramstr.matchAll(/[^\s,]/g)].map(param => param[0]) // "a, b" becomes ["a", "b"]
            const fun = str.match(/(?<=^[^{]*{)[^]*(?=}[^}]*$)/)?.[0]               // "(a, b) => { return a+b }" becomes "return a+b"
            if (typeof fun !== "string") return null                                // return null if input wasn't a function

            // create and return function
            return Function(...params, fun)

        }

    } catch (err) {
        throw `Invalid function string: ${str}`
    }
}

function isNativeFunction(fun: CallableFunction): boolean {
    return fun?.toString?.()?.match(/^[^{]*{\s*\[native\s*code\]\s*}\s*$/) != null
}