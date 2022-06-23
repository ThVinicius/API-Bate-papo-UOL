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

app.post('/participants', async (req, res) => {
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

  await db.collection('participants').insertOne(participant)

  await db.collection('messages').insertOne(message)

  res.sendStatus(201)
})

app.get('/participants', async (req, res) => {
  const participants = await db.collection('participants').find().toArray()

  res.send(participants)
})

app.post('/messages', async (req, res) => {
  const { to, text, type } = req.body
  const { user: from } = req.headers
  const time = dayjs().format('HH:mm:ss')

  const message = { from, to, text, type, time }

  await db.collection('messages').insertOne(message)

  res.sendStatus(201)
})

app.get('/messages', async (req, res) => {
  const { limit } = req.query

  const messages = await db.collection('messages').find().toArray()

  res.send(messagesToSend(limit, messages))
})

app.post('/status', async (req, res) => {
  const { user } = req.headers
  const lastStatus = Date.now()

  await db
    .collection('participants')
    .updateOne({ name: user }, { $set: { lastStatus } })

  res.sendStatus(200)
})

app.listen(5000, () => {
  const now = Math.floor(Date.now() / 1000)
  const now1 = dayjs(Date.now()).unix()
  console.log('usando Math', now)
  console.log('usando dayjs', now1)
})

function messagesToSend(limit, array) {
  if (limit === undefined) {
    return [...array].reverse()
  }
  return [...array].reverse().slice(0, limit)
}
