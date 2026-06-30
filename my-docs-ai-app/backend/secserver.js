




// const quary = [

//     {
//         name: "apple",
//         count: 3
//     },
//     {
//         name: "banana",
//         count: 5
//     }
// ]

// const searchterm = "a"



// function searchf(quary, searchterm, ...rest){

//     if(!quary || !searchterm){
//         throw new Error("need quary and searchterm");
//     }

//     if(!Array.isArray(quary) || typeof searchterm !== "string"){
//         throw new Error("need quary to be array and searchterm to be string");
//     }

//     if(rest){

//         let pquary 

//         for(let i = 0, len = rest.length; i < len; i++){
//             pquary = quary[rest[i]];
//             console.log(pquary);
//         }

//         const search = pquary.filter((item) => {
//         return item.toLowerCase().includes(searchterm.toLowerCase());
//     })

//     return search;

//     }

//     const search = quary.filter((item) => {
//         return item.toLowerCase().includes(searchterm.toLowerCase());
//     })

//     return search;
// }


// console.log(searchf(quary, searchterm, "name"))




// const dec = "1.03";

// function makeDtoSN(dec) {

//     const newDec = String(dec)
//     console.log(newDec[0])

//     if(newDec[0] === "0"){
//         const secnewDec = newDec.split();
//         console.log(secnewDec)
//         const indexdec = secnewDec.indexOf(".");
//         console.log()
//         const firstdigI = secnewDec.forEach((item, index) => {
//             if(Number(item) !== 0){
//                 return index;
//             }
//         })[0]

//         const power = String(firstdigI - indexdec)

//         const partofdec = secnewDec.slice(firstdigI, secnewDec.length);
//         console.log(partofdec)
//         const newpartofD = partofdec.splice(0, 0, ".")
//         console.log(newpartofD)

//         return `${newpartofD.join("")}^-${power}`;
//     }
//     else{
//         console.log("hello")
//         const secnewDec = newDec.split();
//         const indexdec = secnewDec.indexOf(".");
//         if(indexdec === 1){
//             return newDec.join("") + "^" + String(secnewDec.length - 1);
//         }
//         const power =  secnewDec.slice(0, indexdec).length;
//         console.log(power)
//         const partofdec = secnewDec.splice(indexdec, 1)
//         const newpartofD = partofdec.splice(0, 0, ".")
//          return `${newpartofD.join("")}^${power}`;
//     }



// }



// console.log(makeDtoSN(dec))


import express from "express"
import path from "path"
import { fileURLToPath } from "url"


const app = express()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json())


app.post("/server", (req, res) => {
    console.log(req.body)
    res.json({ message: "Data received successfully" })
})

app.get("/server", (req, res) => {

    res.sendFile(path.join(__dirname, "index.html"))

})


app.listen(3000, () => console.log("on port 3000"))






