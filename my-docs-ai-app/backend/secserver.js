




const quary = [

    {
        name: "apple",
        count: 3
    },
    {
        name: "banana",
        count: 5
    }
]

const searchterm = "a"



function searchf(quary, searchterm, ...rest){

    if(!quary || !searchterm){
        throw new Error("need quary and searchterm");
    }

    if(!Array.isArray(quary) || typeof searchterm !== "string"){
        throw new Error("need quary to be array and searchterm to be string");
    }

    if(rest){

        let pquary 

        for(let i = 0, len = rest.length; i < len; i++){
            pquary = quary[rest[i]];
            console.log(pquary);
        }

        const search = pquary.filter((item) => {
        return item.toLowerCase().includes(searchterm.toLowerCase());
    })

    return search;

    }

    const search = quary.filter((item) => {
        return item.toLowerCase().includes(searchterm.toLowerCase());
    })

    return search;
}


console.log(searchf(quary, searchterm, "name"))








