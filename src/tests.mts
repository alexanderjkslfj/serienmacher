#!/usr/bin/env -S deno run

//@ts-ignore
import { stringify, parse } from "./index.mts"

{
    const x = parse(stringify("Hello World"))

    console.log(x === "Hello World")
}

{
    const x = stringify({ a: 5 })
    const y = parse(x)

    console.log(y?.a === 5)
}

{
    const x = stringify({ a: "b" })
    const y = parse(x)

    console.log(y?.a === "b")
}

{
    const a = { a: {} }
    a.a = a

    const x = stringify(a)
    const y = parse(x)

    console.log(y?.a?.a?.a?.a?.a === y)
}

{
    const a = { b: {} }
    const b = { a: a }
    a.b = b

    const x = parse(stringify(a))

    console.log(x?.b?.a?.b?.a === x)
}

{
    class a {
        public b: number

        constructor() {
            this.b = 5
        }
    }

    const b = new a()

    const c = stringify(b)
    const d = parse(c)

    console.log(b.b === d?.b)
}

{
    const a = ["a", "b", "c"]

    const x = stringify(a)
    const y = parse(x)

    console.log(a.length === y?.length)
}

{
    const a = ["a", "b", "c"]

    const x = stringify(a)
    const y = parse(x)

    y?.constructor?.prototype?.push?.apply?.(y, ["d"])

    console.log(y.length === 4)
}

{
    const a = ["a", "b", "c"]

    const x = stringify(a)
    const y = parse(x)

    y?.push?.("d")

    console.log(y.length === 4)
}