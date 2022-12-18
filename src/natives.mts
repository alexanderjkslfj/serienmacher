// set of all native objects
const natives: Set<object> = new Set<object>()

// add initial objects
if (["object", "function"].includes(typeof globalThis) && globalThis !== null) natives.add(globalThis)
if (["object", "function"].includes(typeof this) && this !== null) natives.add(this)
if (["object", "function"].includes(typeof window) && window !== null) natives.add(window)

// recursively retrieve all objects referenced by previously retrieved objects
for (const object of natives) {

    Object.values(Object.getOwnPropertyDescriptors(object)).forEach(descriptor => {

        if (["object", "function"].includes(typeof descriptor.value) && descriptor.value !== null)
            natives.add(descriptor.value)

    })

    const proto = Object.getPrototypeOf(object)
    if (["object", "function"].includes(typeof proto) && proto !== null)
        natives.add(proto)

}

// export native objects as array
export default Array.from(natives)