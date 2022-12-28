/**
 * Types of values (which may use different methods for serialization/deserialization)
 */
export enum valueType {
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
export enum objectType {
    NORMAL,
    ARRAY,
    FUNCTION,
    BLOB
}

export enum keyType {
    STRING,
    NATIVE_SYMBOL,
    CUSTOM_SYMBOL
}

/**
 * A basic value, relative to its valueType
 */
export type TypedBasic<T> =
    (T extends valueType.NATIVE ? object :
        (T extends valueType.BIGINT ? bigint :
            (T extends valueType.SYMBOL ? symbol :
                (T extends valueType.UNDEFINED ? undefined :
                    (null | string | number | boolean)))))

/**
 * List of serialized objects and native indexes.
 */
export type serializedList = (serializedObject<any> | number)[]

/**
 * Representation of a serialized complex object.
 * Contains a list of serialized and native objects as well as a list of symbol descriptions
 */
export type serializedComplex = {
    objects: serializedList,
    symbols: (string | null)[]
}

/**
 * An object in serialized form, part of a serialized complex
 */
export type serializedObject<type extends objectType> = {
    type: type,
    data: specialData<type>,
    proto: proto,
    props: property[]
}

export type specialData<type extends objectType> = (
    type extends objectType.FUNCTION ? string
    : type extends objectType.BLOB ? string
    : undefined)

/**
 * Index of the prototype and whether it's native
 */
export type proto = {
    native: boolean,
    index: number
}

/**
 * Data of an object property
 */
export type property = {
    key: propkey,
    type: valueType,
    descriptor: propertyDescriptor
}

export type propkey = {
    type: keyType.STRING | keyType.NATIVE_SYMBOL,
    value: string
} | {
    type: keyType.CUSTOM_SYMBOL,
    value: number
}

/**
 * Descriptor of an object property
 */
export type propertyDescriptor = {
    configurable: boolean,
    writable: boolean,
    enumerable: boolean,
    value: string | number,
    get: number,
    set: number
}