const nativeSet: Set<object> = new Set<object>()

export const natives: Array<object> = []

export function addNatives(...newNatives: object[]): void {
    // get previous size of set
    let size = nativeSet.size;

    // add new natives to set
    for (const native of newNatives) {
        nativeSet.add(native);
    }

    // iterate over natives
    for (const native of nativeSet) {

        // skip over natives already present previously
        if (size !== 0) {
            size--;
            continue;
        }

        // add non-primitive properties of native object to natives
        addProperties(native)

    }

    // add new natives to array
    natives.splice(0, natives.length, ...nativeSet)
}

function addProperties(native: object): void {
    addValues(native)
    addPrototype(native)
}

function addValues(native: object): void {

    Object.values(Object.getOwnPropertyDescriptors(native)).forEach(descriptor => {

        if (["object", "function"].includes(typeof descriptor.value) && descriptor.value !== null)
            nativeSet.add(descriptor.value)

    })

}

function addPrototype(native: object): void {

    const proto = Object.getPrototypeOf(native)
    if (["object", "function"].includes(typeof proto) && proto !== null)
        nativeSet.add(proto)

}

if (["object", "function"].includes(typeof globalThis) && globalThis !== null) addNatives(globalThis)
if (["object", "function"].includes(typeof this) && this !== null) addNatives(this)
if (["object", "function"].includes(typeof window) && window !== null) addNatives(window)

if (["object", "function"].includes(typeof Blob) && Blob !== null) addNatives(Blob)
if (["object", "function"].includes(typeof ArrayBuffer) && ArrayBuffer !== null) addNatives(ArrayBuffer)