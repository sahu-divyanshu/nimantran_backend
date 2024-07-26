const functions = require("firebase-functions");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const clientRoutes = require("./routes/clientRoutes");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const cardRoutes = require("./routes/cardImage");
// const videoRoutes = require('./routes/videoRoutes');
// const PdfRoutes = require('./routes/cardPdf');
const eventRoutes = require("./routes/eventRoutes");
const transictionRoutes = require("./routes/TransictionRoutes");
const app = express();

dotenv.config();
connectDB();

app.use(cors());
app.use(express.json());
app.use("/tmp", express.static("tmp"));
app.use(express.urlencoded({ extended: true }));


app.get("/", (req, res) => {
    res.json("server started ....");
});

app.use("/api/admin", adminRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/users", userRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/transictions", transictionRoutes);

// app.use('/api/videoEdit', videoRoutes);
app.use("/api/imageEdit", cardRoutes);
// app.use('/api/pdfEdit', PdfRoutes)

app.listen(8000, () => {
    console.log("listening")
})

exports.app = functions.https.onRequest(app);
