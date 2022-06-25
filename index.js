import express, { json } from 'express'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import cors from 'cors'
import dayjs from 'dayjs'
import joi from 'joi'
import { stripHtml } from 'string-strip-html'

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
  const name = stripHtml(req.body.name).result

  const validation = participantsSchema.validate({ name })

  if (validation.error) {
    return res.sendStatus(422)
  }

  const filterParticipants = await db
    .collection('participants')
    .findOne({ name: { $eq: name } })

  if (filterParticipants !== null) return res.sendStatus(409)

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
  const from = stripHtml(req.headers.user).result

  const fromSchema = joi.array().has(joi.object({ name: from }).unknown())

  const participants = await db.collection('participants').find().toArray()

  const validationBody = messagesSchema.validate(req.body)
  const validationHeaders = fromSchema.validate(participants)

  if (validationBody.error || validationHeaders.error) {
    return res.sendStatus(422)
  }

  const to = stripHtml(req.body.to).result.trim()
  const text = stripHtml(req.body.text).result.trim()
  const type = stripHtml(req.body.type).result.trim()

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
    return res.sendStatus(404)
  }

  const lastStatus = Date.now()

  await db
    .collection('participants')
    .updateOne({ name: user }, { $set: { lastStatus } })

  res.sendStatus(200)
})

app.delete('/messages/:id', async (req, res) => {
  const _id = new ObjectId(req.params.id)
  const user = stripHtml(req.headers.user).result

  const message = await db.collection('messages').findOne({ _id })

  switch (true) {
    case message === null:
      return res.sendStatus(404)

    case message !== null && user !== message.from:
      return res.sendStatus(401)

    default:
      await db.collection('messages').deleteOne({ _id })
      return res.sendStatus(200)
  }
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
  const tenSegondsAgo = now - 1000 * 10
  const filter = { lastStatus: { $lt: tenSegondsAgo } }

  const participants = await db
    .collection('participants')
    .find(filter)
    .toArray()

  for (const { _id, name } of participants) {
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
}, 15000)
