import express, { json } from 'express'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import cors from 'cors'
import dayjs from 'dayjs'
import joi from 'joi'

const messagesSchema = joi.object({
  to: joi.string().trim().required(),
  text: joi.string().trim().required(),
  type: joi.string().valid('message', 'private_message').required()
})

const participantsSchema = joi.object({
  name: joi.string().trim().required()
})

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

  const validation = participantsSchema.validate({ name })

  if (validation.error) {
    return res.sendStatus(422)
  }

  const participants = await db.collection('participants').find().toArray()

  if (participants.some(item => item.name === name)) return res.sendStatus(409)

  const lastStatus = Date.now()
  const participant = { name, lastStatus }

  const message = {
    from: name,
    to: 'Todos',
    text: 'entra na sala...',
    type: 'status',
    time: dayjs().format('HH:mm:ss')
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
  const { user: from } = req.headers

  const fromSchema = joi.array().has(joi.object({ name: from }).unknown())

  const participants = await db.collection('participants').find().toArray()

  const validationBody = messagesSchema.validate(req.body)
  const validationHeaders = fromSchema.validate(participants)

  if (validationBody.error || validationHeaders.error) {
    return res.sendStatus(422)
  }

  const { to, text, type } = req.body

  const time = dayjs().format('HH:mm:ss')

  const message = { from, to, text, type, time }

  await db.collection('messages').insertOne(message)

  res.sendStatus(201)
})

app.get('/messages', async (req, res) => {
  const { limit } = req.query
  const { user } = req.headers

  let messages = await db.collection('messages').find().toArray()

  messages = messages.filter(item => filterMessages(item, user))

  res.send(messagesToSend(limit, messages))
})

app.post('/status', async (req, res) => {
  const { user } = req.headers

  const fromSchema = joi.array().has(joi.object({ name: user }).unknown())

  const participants = await db.collection('participants').find().toArray()

  const validationHeaders = fromSchema.validate(participants)

  if (validationHeaders.error) {
    return res.sendStatus(422)
  }

  const lastStatus = Date.now()

  await db
    .collection('participants')
    .updateOne({ name: user }, { $set: { lastStatus } })

  res.sendStatus(200)
})

app.delete('/messages/:id', async (req, res) => {
  const { id } = req.params
  const { user } = req.headers

  const message = await db
    .collection('messages')
    .find({ _id: new ObjectId(id) })

  await db.collection('messages').deleteOne({ _id: new ObjectId(id) })
})

app.put('/messages/:id', async (req, res) => {
  const _id = new ObjectId(req.params.id)
  const { to, text, type } = req.body
  const { user: from } = req.headers

  const messageToSend = {
    from,
    to,
    text,
    type,
    time: dayjs().format('HH:mm:ss')
  }

  await db.collection('messages').updateOne({ _id }, { $set: messageToSend })
})

app.listen(5000)

function messagesToSend(limit, array) {
  if (limit === undefined) {
    return array
  }
  return array.slice(-limit)
}

function filterMessages({ from, to, type }, user) {
  return (
    type === 'message' ||
    type === 'status' ||
    from === user ||
    (type === 'private_message' && to === user)
  )
}

setInterval(async () => {
  const now = Date.now()

  const participants = await db.collection('participants').find().toArray()

  for (const { _id, name, lastStatus } of participants) {
    const lastStatusUser = Math.floor(lastStatus / 1000)

    if (Math.floor(now / 1000) - lastStatusUser > 10) {
      const message = {
        from: name,
        to: 'Todos',
        text: 'sai da sala...',
        type: 'status',
        time: dayjs(now).format('HH:mm:ss')
      }

      await db.collection('messages').insertOne(message)

      await db.collection('participants').deleteOne({ _id })
    }
  }
}, 15000)
