enum valueType {
    JSONREADY,
    COMPLEX,
    BIGINT,
    SYMBOL,
    UNDEFINED
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

function parseComplex(value: parsedObject[]): object {
    const input = value
    const output: object[] = []

    for (const object of input) {
        output.push((object.fData === null)
            ? {}
            : parseFunctionData(object.fData)
        )
    }

    for(let i = 0; i < input.length; i++) {
        for (const prop of input[i].props) {
            
            const key = prop.key.symbol ? Symbol[prop.key.value] : prop.key.value

            const value = (prop.type === valueType.COMPLEX)
                ? output[prop.descriptor.value]
                //@ts-ignore
                : parseBasic(prop.type, prop.descriptor.value)

            const descriptor: PropertyDescriptor = {
                configurable: prop.descriptor.configurable,
                enumerable: prop.descriptor.enumerable,
                writable: prop.descriptor.writable,
                value: value
            }

            if (prop.descriptor.set !== -1)
                //@ts-ignore
                descriptor.set = output[prop.descriptor.set]

            if (prop.descriptor.get !== -1)
                //@ts-ignore
                descriptor.get = output[prop.descriptor.get]

            Object.defineProperty(output[i], key, descriptor)
        }
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
    fData: functionData | null,
    props: property[]
}

type functionData =
    { native: true, value: number } | { native: false, value: string }

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

function serializeComplex(complex: object): parsedObject[] {
    const parsed: parsedObject[] = []
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

        const p: parsedObject = {
            fData: getFunctionData(current),
            props: []
        }

        const keys = Reflect.ownKeys(current)

        for (const key of keys) {
            const rawDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(current, key)!

            const symbolName = (typeof key === "symbol") ? tryFindSymbol(key) : ""

            if (symbolName !== null) {

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
                    enumerable: (typeof rawDescriptor.enumerable === "boolean") ? rawDescriptor.enumerable : true,
                    writable: (typeof rawDescriptor.writable === "boolean") ? rawDescriptor.writable : true,
                    get: getterIndex,
                    set: setterIndex,
                    value: (valueIndex === -1) ? serializeBasic(type, value)[0] : valueIndex
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

        }

        parsed.push(p)
    }

    return parsed

}

function getFunctionData(object: object): functionData | null {
    if (typeof object === "function") {
        const native = isNative(object)
        return (native)
            ? {
                native: true,
                value: getNativeId(object)
            }
            : {
                native: false,
                value: getFunctionString(object)
            }
    }
    return null
}

function isNative(object: CallableFunction): boolean {
    return object.toString().match(/^\s*((\([^)]*\)\s*=>)|(function[^(]*\([^)]*\)))\s*{\s*\[native code\]\s*}\s*$/) !== null
}

// TODO: actually implement
function getNativeId(object: CallableFunction): number {
    return 0
}

// TODO: actually implement
function useNativeId(id: number): CallableFunction {
    return () => { }
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

function parseFunctionData(data: functionData): CallableFunction {
    return (data.native)
        ? useNativeId(data.value)
        : parseFunctionString(data.value)
}

// TODO: improve
function parseFunctionString(str: string): CallableFunction {
    return new Function(str)
}