//@ts-ignore
import natives from "./natives.mts"

enum valueType {
    JSONREADY,
    COMPLEX,
    BIGINT,
    SYMBOL,
    UNDEFINED,
    NATIVE
}

export function stringify(something: any): string {
    const type = getValueType(something)

    return JSON.stringify([type, (type === valueType.COMPLEX)
        ? serializeComplex(something)
        : serializeBasic(type, something)
    ])
}

export function parse(something: string): any {
    const [type, value] = JSON.parse(something)
    return (type === 1)
        ? parseComplex(value)
        : parseBasic(type, value)
}

function parseBasic(type: valueType, value: string): any {
    switch (type) {
        case valueType.JSONREADY:
            return JSON.parse(value)
        case valueType.BIGINT:
            return BigInt(value)
        case valueType.SYMBOL:
            return Symbol[value]
        case valueType.UNDEFINED:
            return undefined
    }
}

function parseComplex(value: (parsedObject | number)[]): object {
    const input = value
    const output: object[] = []

    for (const object of input) {
        output.push((typeof object === "number")
            ? natives[object]
            : (object.fun === null)
                ? {}
                : parseFunctionString(object.fun)
        )
    }

    for (let i = 0; i < input.length; i++) {
        if (typeof input[i] === "number")
            continue

        //@ts-ignore
        for (const prop of input[i].props) {

            const key = prop.key.symbol ? Symbol[prop.key.value] : prop.key.value

            const descriptor: PropertyDescriptor = {
                configurable: prop.descriptor.configurable,
                enumerable: prop.descriptor.enumerable
            }

            if (prop.descriptor.set !== -1)
                //@ts-ignore
                descriptor.set = output[prop.descriptor.set]

            if (prop.descriptor.get !== -1)
                //@ts-ignore
                descriptor.get = output[prop.descriptor.get]

            if (prop.descriptor.set === -1 && prop.descriptor.get === -1) {
                descriptor.writable = prop.descriptor.writable
                descriptor.value = (prop.type === valueType.COMPLEX)
                    ? output[prop.descriptor.value]
                    //@ts-ignore
                    : parseBasic(prop.type, prop.descriptor.value)
            }

            Object.defineProperty(output[i], key, descriptor)
        }

        //@ts-ignore
        Object.setPrototypeOf(output[i], (input[i].proto.native)
            //@ts-ignore
            ? natives[input[i].proto.index]
            //@ts-ignore
            : output[input[i].proto.index]
        )
    }

    return output[0]
}

function serializeBasic(type: valueType, basic: string | number | boolean | symbol | bigint): string {
    switch (type) {
        case valueType.JSONREADY:
            return JSON.stringify(basic)
        case valueType.BIGINT:
            return basic.toString()
        case valueType.SYMBOL:
            //@ts-ignore
            return findSymbol(basic)
        case valueType.UNDEFINED:
            return ""
        case valueType.NATIVE:
            return natives[basic]
    }
    console.error("Invalid parameter passed to basic2str:", basic)
    throw "ParameterError"
}

function getValueType(value: any): valueType {
    if (value === null || ["string", "number", "boolean"].includes(typeof value))
        return valueType.JSONREADY

    switch (typeof value) {
        case "bigint":
            return valueType.BIGINT
        case "symbol":
            return valueType.SYMBOL
        case "undefined":
            return valueType.UNDEFINED
        default:
            return valueType.COMPLEX
    }

}

type parsedObject = {
    fun: string | null,
    proto: proto,
    props: property[]
}

type proto = {
    native: boolean,
    index: number
}

type property = {
    key: {
        symbol: boolean
        value: string
    },
    type: valueType,
    descriptor: propertyDescriptor
}

type propertyDescriptor = {
    configurable: boolean,
    writable: boolean,
    enumerable: boolean,
    value: string | number,
    get: number,
    set: number
}

function serializeComplex(complex: object): (parsedObject | number)[] {
    const parsed: (parsedObject | number)[] = []
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

        const proto = Object.getPrototypeOf(current)
        let nativeProto = true
        let protoIndex = findNativeIndex(proto)
        if (protoIndex === -1) {
            nativeProto = false
            protoIndex = findOrAddObject(proto)
        }

        const p: parsedObject = {
            fun: (typeof current === "function") ? getFunctionString(current) : null,
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

function findNativeIndex(object: object): number {
    return natives.findIndex((native: object) => native === object)
}

// TODO: improve
function getFunctionString(object: CallableFunction): string {
    return object.toString()
}

function tryFindSymbol(symbol: symbol): string | null {
    const key = Object.getOwnPropertyNames(Symbol).find(value => Symbol[value] === symbol)
    return (key === undefined) ? null : key
}

function findSymbol(symbol: symbol): string {
    const key = Object.getOwnPropertyNames(Symbol).find(value => Symbol[value] === symbol)
    if (key === undefined)
        throw "Unknown symbol"
    return key
}

// TODO: improve
function parseFunctionString(str: string): CallableFunction {
    return new Function(str)
}