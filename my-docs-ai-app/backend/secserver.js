class Me {

    me = "warren"


    fnget() {
        console.log(this.me)
    }

    sayHello() {
        console.log("hello" + " " + this.me)
    }
}

const person = new Me

person.fnget()

person.sayHello()



Array.prototype.myMap = function(fn) {

if(typeof fn !== "function"){
    throw new Error("Argument must be a function")
}

console.log(this)

let result = []

    for (let i = 0; i <this.length; i++){
        result.push(fn(this[i], i, this))
    }

    return result
}


const ar = [1,2,3,4]

const newar = ar.myMap((item) => {return item + 1})

console.log(newar)