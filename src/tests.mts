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
    new Test("Simple String", () => {
        const x = deserialize(serialize("Hello World"))

        return [x === "Hello World", x]
    }),
    new Test("Basic Object", () => {
        const x = serialize({ a: 5 })
        const y = deserialize(x)

        return [y?.a === 5, y]
    }),
    new Test("Basic Object with String", () => {
        const x = serialize({ a: "b" })
        const y = deserialize(x)

        return [y?.a === "b", y]
    }),
    new Test("Cyclic Object", () => {
        const a = { a: {} }
        a.a = a

        const x = serialize(a)
        const y = deserialize(x)

        return [y?.a?.a?.a?.a?.a === y, y]
    }),
    new Test("Cyclic Object with Extra Steps", () => {
        const a = { b: {} }
        const b = { a: a }
        a.b = b

        const x = deserialize(serialize(a))

        return [x?.b?.a?.b?.a === x, x]
    }),
    new Test("Simple new-based Object", () => {
        class a {
            public b: number

            constructor() {
                this.b = 5
            }
        }

        const b = new a()

        const c = serialize(b)
        const d = deserialize(c)

        return [b.b === d?.b, d]
    }),
    new Test("Array Values", () => {
        const a = ["a", "b", "c"]

        const x = serialize(a)
        const y = deserialize(x)

        return [a.length === y?.length, y]
    }),
    new Test("Array Constructor Methods", () => {
        const a = ["a", "b", "c"]

        const x = serialize(a)
        const y = deserialize(x)

        y?.constructor?.prototype?.push?.apply?.(y, ["d"])

        return [y?.length === 4, y]
    }),
    new Test("Array Inherited Methods", () => {
        const a = ["a", "b", "c"]

        const x = serialize(a)
        const y = deserialize(x)

        y?.push?.("d")

        return [y?.length === 4, y]
    }),
    new Test("Function Name", () => {
        const a = function b() {

        }

        const x = serialize(a)
        const y = deserialize(x)

        return [a.name === y?.name, y]
    }),
    new Test("Function Value", () => {
        const a = function b(n: number, m: number): number {
            return n + m
        }

        const x = serialize(a)
        const y = deserialize(x)

        const aVal = a(1, 2)
        const yVal = y(1, 2)

        return [aVal === 3 && aVal === yVal, yVal]
    }),
    new Test("Named Class", () => {
        class test {
            public a: number

            constructor(b: number) {
                this.a = b
            }
        }

        const x = serialize(test)
        const y = deserialize(x)

        const objt = new test(3)
        const objy = new y(3)

        return [objt.a === 3 && objt.a === objy.a, y]
    }),
    new Test("Anonymous Class", () => {
        const test = class {
            public a: number

            constructor(b: number) {
                this.a = b
            }
        }

        const x = serialize(test)
        const y = deserialize(x)

        const objt = new test(3)
        const objy = new y(3)

        return [objt.a === 3 && objt.a === objy.a, y]
    }),
    new Test("Normal Function", () => {
        function a(b: number, c: number) {
            return b + c
        }

        const x = serialize(a)
        const y = deserialize(x)

        return [y(1, 2) === 3, y]
    }),
    new Test("Anonymous Function", () => {
        const a = function (b: number, c: number) {
            return b + c
        }

        const x = serialize(a)
        const y = deserialize(x)

        return [y(1, 2) === 3, y]
    }),
    new Test("Arrow Function", () => {
        const a = (b: number, c: number) => {
            return b + c
        }

        const x = serialize(a)
        const y = deserialize(x)

        return [y(1, 2) === 3, y]
    }),
    new Test("True Native", () => {
        const x = serialize(Object)
        const y = deserialize(x)

        return [x === y, y]
    })
];

Test.runTests(tests).then(success => {
    console.log(success
        ? "✅ All tests finished successfully."
        : "❌ Some tests did not finish successfully."
    )
})