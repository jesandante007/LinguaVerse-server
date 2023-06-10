const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

// middleware's
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));
// jwt middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jtzepo9.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const classCollection = client.db("summer-campDB").collection("classes");
    const instructorCollection = client
      .db("summer-campDB")
      .collection("instructors");
    const userCollection = client.db("summer-campDB").collection("users");
    const bookingCollection = client.db("summer-campDB").collection("bookings");
    const enrollCollection = client.db("summer-campDB").collection("enrolls");
    const paymentCollection = client.db("summer-campDB").collection("payments");

    app.post("/jwt", (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // generate client secret stripe
    app.post("/create-payment-secret", verifyJWT, async (req, res) => {
      const { price } = req.body;
      if (price) {
        const amount = parseInt(price * 100);

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      }
    });

    // class related api--------------------------------------------------
    app.post("/classes", verifyJWT, async (req, res) => {
      const cls = req.body;
      const result = await classCollection.insertOne(cls);
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const query = {
        $or: [{ status: "approved" }, { status: { $exists: false } }],
      };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/classes/:email", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.params.email;
      if (decodedEmail !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/myClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (decodedEmail !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.get("/manageClasses", verifyJWT, async (req, res) => {
      const query = { email: { $exists: true } };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/myClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;
      const data = req.body;
      const decodedEmail = req.decoded.email;
      if (decodedEmail !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { ...data },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/approveClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "approved" },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/denyClasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "denied" },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // instructor related api---------------------------------------------
    app.get("/instructors", async (req, res) => {
      const result = await instructorCollection.find().toArray();
      res.send(result);
    });

    // user related api---------------------------------------------------
    // save user to db
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    app.get("/users", verifyJWT, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.patch("/users/admin/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/users/instructor/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: "instructor" },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // booking related api------------------------------------------------
    // save classes to db
    app.put("/bookings/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const cls = req.body;
      const query = { $and: [{ classId: cls.classId }, { email: email }] };
      const options = { upsert: true };
      const updateDoc = {
        $set: cls,
      };
      const result = await bookingCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // get myClasses by email
    app.get("/bookings/myClasses/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    // delete from myClasses
    app.delete("/bookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    // payment related api------------------------------------------------
    // save payment info
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const findQuery = {
        _id: { $in: payment.classes.map((id) => new ObjectId(id)) },
      };
      const updateResult = await classCollection.updateMany(findQuery, {
        $inc: { availableSeats: -1 },
      });
      const deleteQuery = {
        _id: { $in: payment.bookings.map((id) => new ObjectId(id)) },
      };
      const enrollArray = await bookingCollection.find(deleteQuery).toArray();
      const insertEnrollArray = await enrollCollection.insertMany(enrollArray);
      const deleteResult = await bookingCollection.deleteMany(deleteQuery);
      res.send({ insertResult, updateResult, deleteResult, insertEnrollArray });
    });

    // payment history
    app.get("/payments/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();

      res.send(result);
    });

    // enroll related api-------------------------------------------------
    // get enroll classes by email
    app.get("/enrolls/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await enrollCollection.find(query).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("summer-camp-school is running");
});

app.listen(port, () => {
  console.log(`summer-camp-school is running on port ${port}`);
});
