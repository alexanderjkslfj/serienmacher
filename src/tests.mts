import { serialize, deserialize } from "./index.mjs"

type TestMethod = () => ([boolean, any] | Promise<[boolean, any]>)

class Test {
    private name: string
    private method: TestMethod

    public constructor(name: string, method: TestMethod) {
        this.name = name
        this.method = method
    }

    public async runTest(): Promise<boolean> {
        try {
            const result = await this.method()
            if (result[0])
                console.log(`✅ Success: Test "${this.name}" was successful.`)
            else
                console.log(`❌ Error: Test "${this.name}" returned a wrong result:`, result[1])
            return result[0]
        } catch (err) {
            console.log(`❌ Error: Test "${this.name}" returned an error:`, err)
            return false
        }
    }

    public static async runTests(tests: Test[]): Promise<boolean> {
        let success = true
        for (const test of tests) {
            const result = await test.runTest();
            if (result === false) success = false
        }
        return success
    }
}

const tests: Test[] = [
    new Test("Simple String", async () => {
        const x = deserialize(await serialize("Hello World"))

        return [x === "Hello World", x]
    }),
    new Test("Basic Object", async () => {
        const a = { a: 5 }

        const x = await serialize(a)
        const y = deserialize(x) as typeof a

        return [y?.a === 5, y]
    }),
    new Test("Basic Object with String", async () => {
        const a = { a: "b" }

        const x = await serialize(a)
        const y = deserialize(x) as typeof a

        return [y?.a === "b", y]
    }),
    new Test("Cyclic Object", async () => {
        const a = { a: {} }
        a.a = a

        const x = await serialize(a)
        const y = deserialize(x) as any

        return [y?.a?.a?.a?.a?.a === y, y]
    }),
    new Test("Cyclic Object with Extra Steps", async () => {
        const a = { b: {} }
        const b = { a: a }
        a.b = b

        const x = deserialize(await serialize(a)) as any

        return [x?.b?.a?.b?.a === x, x]
    }),
    new Test("Simple new-based Object", async () => {
        class a {
            public b: number

            constructor() {
                this.b = 5
            }
        }

        const b = new a()

        const c = await serialize(b)
        const d = deserialize(c) as typeof b

        return [b.b === d?.b, d]
    }),
    new Test("Array Values", async () => {
        const a = ["a", "b", "c"]

        const x = await serialize(a)
        const y = deserialize(x) as string[]

        return [a.length === y?.length, y]
    }),
    new Test("Array Constructor Methods", async () => {
        const a = ["a", "b", "c"]

        const x = await serialize(a)
        const y = deserialize(x) as string[]

        y?.constructor?.prototype?.push?.apply?.(y, ["d"])

        return [y?.length === 4, y]
    }),
    new Test("Array Inherited Methods", async () => {
        const a = ["a", "b", "c"]

        const x = await serialize(a)
        const y = deserialize(x) as string[]

        y?.push?.("d")

        return [y?.length === 4, y]
    }),
    new Test("Function Name", async () => {
        const a = function b() {

        }

        const x = await serialize(a)
        const y = deserialize(x) as () => unknown

        return [a.name === y?.name, y]
    }),
    new Test("Function Value", async () => {
        const a = function b(n: number, m: number): number {
            return n + m
        }

        const x = await serialize(a)
        const y = deserialize(x) as typeof a

        const aVal = a(1, 2)
        const yVal = y(1, 2)

        return [aVal === 3 && aVal === yVal, yVal]
    }),
    new Test("Named Class", async () => {
        class test {
            public a: number

            constructor(b: number) {
                this.a = b
            }
        }

        const x = await serialize(test)
        const y = deserialize(x) as typeof test

        const objt = new test(3)
        const objy = new y(3)

        return [objt.a === 3 && objt.a === objy.a, y]
    }),
    new Test("Anonymous Class", async () => {
        const test = class {
            public a: number

            constructor(b: number) {
                this.a = b
            }
        }

        const x = await serialize(test)
        const y = deserialize(x) as typeof test

        const objt = new test(3)
        const objy = new y(3)

        return [objt.a === 3 && objt.a === objy.a, y]
    }),
    new Test("Normal Function", async () => {
        function a(b: number, c: number) {
            return b + c
        }

        const x = await serialize(a)
        const y = deserialize(x) as typeof a

        return [y(1, 2) === 3, y]
    }),
    new Test("Anonymous Function", async () => {
        const a = function (b: number, c: number) {
            return b + c
        }

        const x = await serialize(a)
        const y = deserialize(x) as typeof a

        return [y(1, 2) === 3, y]
    }),
    new Test("Arrow Function", async () => {
        const a = (b: number, c: number) => {
            return b + c
        }

        const x = await serialize(a)
        const y = deserialize(x) as typeof a

        return [y(1, 2) === 3, y]
    }),
    new Test("True Native", async () => {
        const x = await serialize(Object)
        const y = deserialize(x)

        return [Object === y, y]
    }),
    new Test("Non-pure Function", async () => {
        let aaa = 5
        const b = () => {
            aaa += 5
        }

        const x = await serialize(b)
        const y = deserialize(x) as typeof b

        let error: any = null

        try {
            y()
        } catch (err) {
            error = err
        }

        return [error instanceof ReferenceError, error]
    }),
    new Test("Non-native Symbol", async () => {
        const sym = Symbol()

        const myObj = {
            [sym]: {
                [sym]: 5
            }
        }

        const x = await serialize(myObj)
        const y = deserialize(x)

        const newsym = Object.getOwnPropertySymbols(y)?.[0]

        return [y?.[newsym]?.[newsym] === 5, y]
    }),
    new Test("Blob", async () => {
        const blob = new Blob(["abcdef"])

        const x = await serialize(blob)
        const y = deserialize(x)

        const newtext = await blob.text()

        return [newtext === "abcdef", y]
    }),
    new Test("Set", async () => {
        const set = new Set()

        set.add(1)
        set.add(2)
        set.add(2)
        set.add(3)

        const serialized = await serialize(set)
        const deserialized = deserialize(serialized) as Set<unknown>

        const arr = [...deserialized]

        return [
            arr[0] === 1 &&
            arr[1] === 2 &&
            arr[2] === 3 &&
            arr.length === 3,
            deserialized
        ]
    }),
    new Test("Map", async () => {
        const map = new Map()

        map.set("a", 1)
        map.set("b", 2)
        map.set("c", 3)

        const serialized = await serialize(map)
        const deserialized = deserialize(serialized) as Map<unknown, unknown>

        return [
            deserialized.get("a") === 1 &&
            deserialized.get("b") === 2 &&
            deserialized.get("c") === 3 &&
            deserialized.size === 3,
            deserialized
        ]
    }),
    new Test("WeakMap", async () => {
        const map = new WeakMap()

        const a = {}
        const b = {}
        const c = {}

        map.set(a, 1)
        map.set(b, 2)
        map.set(c, 3)

        const serialized = await serialize(map)
        const deserialized = deserialize(serialized) as WeakMap<object, unknown>

        return [
            deserialized.get(a) === 1 &&
            deserialized.get(b) === 2 &&
            deserialized.get(c) === 3,
            deserialized
        ]
    }),
];

Test.runTests(tests).then(success => {
    console.log(success
        ? "✅ All tests finished successfully."
        : "❌ Some tests did not finish successfully."
    )
})