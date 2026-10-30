import mongoose from "mongoose"

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODBURL);
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

process.on("SIGINT",async()=>{
    await mongoose.disconnect()
    console.log("Client Disconnected");
    process.exit(0)
})
export  {connectDB};