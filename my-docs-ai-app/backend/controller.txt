
import {fileURLToPath } from "url"

import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function sendf(req, res) {
    res.sendFile(path.join(__dirname, "index.html"))
}

export default sendf