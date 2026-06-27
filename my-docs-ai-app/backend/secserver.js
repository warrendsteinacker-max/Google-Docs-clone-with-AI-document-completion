const letters = true ? ["a", "b", "c"] : undefined;

const nums = true ? [1, 2, 3] : undefined;

const len = 10

const makep = function(letters, nums, len) {

    if(!letters || !nums){
        throw new Error("must input letters and nums to be used")
    }

    let result = [];

    letters.concat(nums).sort(() => Math.random() - 0.5).forEach((item, index) => {


        if(index < len + 1){
            result.push(item)
        }
    })

    return result.join("")

}


const pass = makep(letters, nums, len)

console.log(pass)








