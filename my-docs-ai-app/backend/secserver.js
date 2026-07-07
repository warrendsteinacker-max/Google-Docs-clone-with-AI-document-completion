




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
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"
import makef from "./controller.js"


// const app = express()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// app.use(express.json())




// app.get("/server", makef)

// app.get("/m", (req, res) => {

//     fs.mkdir(path.join(__dirname, "new"), (err) => {
//         if(err){
//             res.send("bad")
//             console.error(err.message)
//         }
//     })

// })

// app.listen(3000, () => console.log("on port 3000"))











const pass = "123"
let at



// const atoken = new mongoose.Schema({
//     At: {
//         type: String
//     }
// })

// const Atoken = mongoose.model("Atoken", atoken)

const rtoken = new mongoose.Schema({

    Rt: {
        type: String
    }
    
})

const Rtoken = mongoose.model("Rtoken", rtoken)



const app = express()



async function connect(){

    try{
        await mongoose.connect("mongodb+srv://warrendsteinacker_db_user:QWe0NCeaYw8agP48@cluster0.eqf4q9m.mongodb.net/")
        console.log("connected")
    }
    catch(err){
        console.log("not connected")
        console.error(err.message)
    }


}

connect()

app.use(express.json())

app.post("login", async (req, res) => {

    const {pass} = req.body
    if(pass === "123"){
        at = jwt.sign({pass: pass}, "secret", {expiresIn: "1m"})
        const rt = jwt.sign({pass: pass}, "secret", {expiresIn: "2m"})

        await Rtoken.create({Rt: rt})

        return res.status(200).json({msg: "loged in"})
    }

})

app.get("front", (req, res) => {
    res.sendFile(path.join(__dirname, "/index.html"))
})

app.post("ref", async (req, res) => {
    const getrt = await Rtoken.findOne({Rt: rt})

    if(!getrt){
        res.status(401).send("Invalid refresh token")
    }

    if(!at){
        at = jwt.sign({pass: pass}, "secret", {expiresIn: "1m"})

        return res.status(200).json({msg: "new access token created"})
    }

    return res.status(200).json({msg: "access token still valid"})
})


app.listen(3000, () => console.log("on port 3000"))









