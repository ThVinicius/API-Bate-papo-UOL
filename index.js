import express, { json } from 'express'
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import cors from 'cors'
import dayjs from 'dayjs'

const app = express()

dotenv.config()
app.use(cors())
app.use(json())

const mongoClient = new MongoClient(process.env.MONGO_URI)
let db

mongoClient.connect().then(() => {
  db = mongoClient.db('batepapo-uol-api')
})

app.post('/participants', (req, res) => {
  const { name } = req.body
  const lastStatus = Date.now()
  const participant = { name, lastStatus }

  const message = {
    from: name,
    to: 'Todos',
    text: 'entra na sala...',
    type: 'status',
    time: lastStatus
  }

  db.collection('participants')
    .insertOne(participant)
    .then(() => {
      db.collection('messages')
        .insertOne(message)
        .then(() => {
          res.sendStatus(201)
        })
    })
})

app.get('/participants', (req, res) => {
  db.collection('participants')
    .find()
    .toArray()
    .then(participants => {
      res.send(participants)
    })
})

app.post('/messages', (req, res) => {
  const { to, text, type } = req.body
  const { user: from } = req.headers
  const time = dayjs().format('HH:mm:ss')

  const message = { from, to, text, type, time }

  db.collection('messages')
    .insertOne(message)
    .then(() => {
      res.sendStatus(201)
    })
})

app.get('/messages', (req, res) => {
  const { limit } = req.query

  db.collection('messages')
    .find()
    .toArray()
    .then(array => {
      res.send(messages(limit, array))
    })
})

app.post('/status', (req, res) => {
  const { user } = req.headers
  const lastStatus = Date.now()

  db.collection('participants')
    .updateOne({ name: user }, { $set: { lastStatus } })
    .then(() => {
      res.sendStatus(200)
    })
})

app.listen(5000)

function messages(limit, array) {
  if (limit === undefined) {
    return [...array].reverse()
  }
  return [...array].reverse().slice(0, limit)
}
