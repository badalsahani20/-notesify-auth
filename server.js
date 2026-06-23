import dotenv from "dotenv";
dotenv.config();
import app from "./src/app.js";
import connectDB from "./configs/db.js";

const PORT = 5500;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch((error) => {
    console.log(`Error connecting to database ${error}`);
})