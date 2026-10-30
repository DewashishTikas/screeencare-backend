import { MongoClient } from 'mongodb'
const client = new MongoClient(process.env.MONGODBURL)
try {
    const db = client.db()

    const userCollection = []

    for (const collection of userCollection) {
        await db.command({
            collMod: collection.collectionName,
            validator: collection.validator,
            validationAction: "error",
            validationLevel: "strict",
        })
    }

} catch (error) {
    console.log("Error while setting schema", error);
} finally {
    await client.close()
}