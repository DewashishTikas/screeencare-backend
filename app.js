import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import cors from 'cors'
import { connectDB } from './config/mongodb.js'
import authRoutes from "./routes/authRoutes.js"
import phoneRoutes from "./routes/phoneRoutes.js"
import addressRoutes from "./routes/addressRoutes.js"
import cartRoutes from "./routes/cartRoutes.js"
import paymentRoutes from "./routes/paymentRoutes.js"
import orderRoutes from "./routes/orderRoutes.js"
import deliveryRoutes from "./routes/deliveryRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import webhookRoutes from "./routes/webhookRoutes.js"
await connectDB()
const app = express()
app.set('trust proxy', true);
app.use(
  helmet({
    crossOriginOpenerPolicy: {
      policy: 'unsafe-none'
    },
  })
)
const whiteList = [process.env.FRONTEND_URL, "http://localhost:5173"]
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (whiteList.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }

  },
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser(process.env.SECRET_KEY))
app.get('/', (req, res) => {
  return res.json({ message: "checking success " })
})

app.use("/error",async () => {
  throw new Error("Server error");
})

app.use("/auth", authRoutes)
app.use("/phones", phoneRoutes)
app.use("/phone", phoneRoutes)
app.use("/addresses", addressRoutes)
app.use("/cart", cartRoutes)
app.use("/payments", paymentRoutes)
app.use("/orders", orderRoutes)
app.use("/delivery", deliveryRoutes)
app.use("/admin", adminRoutes)
app.use("/webhooks", webhookRoutes)

app.listen(process.env.PORT, () => {
  console.log(`Listening at port ${process.env.PORT}`);
})

