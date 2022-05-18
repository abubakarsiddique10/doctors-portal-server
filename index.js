const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vno9v.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



/* const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vno9v.mongodb.net/myFirstDatabase?retryWrites=true&w=majority;`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 }); */

function verifyJWT (req, res, next) {
    const authHeader = req.headers.authorization;
    if(!authHeader) {
        return res.status(401).send({message: 'unAthurized'})
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded) {
        if(err) {
            return res.status(403).send({message: 'forbiden'})
        }
        req.decoded = decoded;
        next();
    });
    console.log(token)
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');


        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'forbiden' })
            }
            
        }
        app.get('/availabe', async (req, res) => {
            const date = req.query.date;

            const services = await serviceCollection.find().toArray();

            const query = {date: date};
            const cursor = bookingCollection.find(query);
            const booking = await cursor.toArray();

            services.forEach(service => {
                const serviceBookings = booking.filter(b => b.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                
                const availabe = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = availabe;
            })
            res.send(services);
        })

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
            const exist = await bookingCollection.findOne(query);
            if(exist) {
                return res.send({success: false , booking: exist})
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });

        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if(email === decodedEmail) {
                const query = { email: email }
                const result = await bookingCollection.find(query).toArray()
               return res.send(result);
            }
            else {
                return res.status(403).send({message: 'forbiden'})
            }
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email};
            const options = {upsert: true};
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {expiresIn: '1d'});
            res.send({result, token});
        });
        // creat admin
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' }
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({isAdmin});
        })

        app.get('/users', verifyJWT, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        });


        app.get('/service', async (req, res) => {
            const query = {}
            const result = await serviceCollection.find(query).project({name:1}).toArray();
            res.send(result)
        });

        app.get('/doctors', verifyJWT, async (req, res) => {
            const result = await doctorCollection.find().toArray();
            res.send(result)
        })

        app.delete('/doctors/:email',verifyJWT, async (req, res)=> {
            const email = req.params.email;
            const filter = {email: email};
            const result = await doctorCollection.deleteOne(filter);
            res.send(result)
        })

        // added doctor
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result)
        })
    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('server running');
})
app.listen(port, () => {
    console.log('app listen', port);
})