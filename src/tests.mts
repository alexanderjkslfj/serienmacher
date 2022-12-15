#!/usr/bin/env -S deno run

import { stringify, parse } from "./index.mts"

{
    const x = parse(stringify("Hello World"))

    console.log(x === "Hello World")
}

{
    const x = stringify({ a: 5 })
    const y = parse(x)

    console.log(y.a === 5)
}

{
    const x = stringify({ a: "b" })
    const y = parse(x)

    console.log(y.a === "b")
}

{
    const a = { a: {} }
    a.a = a

    const x = stringify(a)
    const y = parse(x)

    console.log(y.a.a.a.a.a === y)
}

{
    const a = {b: {}}
    const b = {a: a}
    a.b = b

    const x = parse(stringify(a))

    console.log(x.b.a.b.a === x)
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

    console.log(b.b === d.b)
}

{
    const a = ["a", "b", "c"]
    
    const x = stringify(a)
    const y = parse(x)

    console.log(x?.length === y?.length)
}