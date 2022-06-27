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

const userSchema = joi
  .object({ user: joi.string().trim().required() })
  .unknown()

const idSchema = joi.object({ id: joi.string().trim().required() })

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
  const validation = participantsSchema.validate(req.body)

  if (validation.error) {
    return res.sendStatus(422)
  }

  const name = stripHtml(req.body.name).result

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

app.get('/participants', async (_, res) => {
  const participants = await db.collection('participants').find().toArray()

  res.send(participants)
})

app.post('/messages', async (req, res) => {
  const fromSchema = joi
    .array()
    .has(joi.object({ name: req.headers.user }).unknown())

  const participants = await db.collection('participants').find().toArray()

  const validationBody = messagesSchema.validate(req.body)
  const validationHeaders = fromSchema.validate(participants)

  if (validationBody.error || validationHeaders.error) {
    return res.sendStatus(422)
  }

  const to = stripHtml(req.body.to).result.trim()
  const text = stripHtml(req.body.text).result.trim()
  const type = stripHtml(req.body.type).result.trim()
  const from = stripHtml(req.headers.user).result

  const time = dayjs().format('HH:mm:ss')

  const message = { from, to, text, type, time }

  await db.collection('messages').insertOne(message)

  res.sendStatus(201)
})

app.get('/messages', async (req, res) => {
  const limitSchema = joi
    .object({ limit: joi.number().integer().required() })
    .allow({})

  const validationUser = userSchema.validate(req.headers)
  const validationLimit = limitSchema.validate(req.query)

  if (validationUser.error || validationLimit.error) return res.sendStatus(422)

  const user = stripHtml(req.headers.user).result
  const limit = Number(req.query.limit)

  const filterUserMessages = {
    $or: [
      { $or: [{ to: 'Todos' }, { to: user }] },
      { from: user },
      { $and: [{ type: 'private_message' }, { to: user }] }
    ]
  }

  const messages = await db
    .collection('messages')
    .find(filterUserMessages)
    .toArray()

  res.send(messagesToSend(limit, messages))
})

app.post('/status', async (req, res) => {
  let user
  try {
    user = stripHtml(req.headers.user).result
  } catch (error) {
    return res.status(406).send(error)
  }

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
  const idValidation = idSchema.validate(req.params)
  const validationUser = userSchema.validate(req.headers)

  if (idValidation.error || validationUser) return res.sendStatus(422)

  const id = stripHtml(req.params.id).result
  const user = stripHtml(req.headers.user).result

  try {
    const message = await db
      .collection('messages')
      .findOne({ _id: ObjectId(id) })

    switch (true) {
      case message === null:
        return res.sendStatus(404)

      case message !== null && user !== message.from:
        return res.sendStatus(401)

      default:
        await db.collection('messages').deleteOne({ _id: ObjectId(id) })
        return res.sendStatus(200)
    }
  } catch (error) {
    return res
      .status(500)
      .send(
        'Argument passed in must be a string of 12 bytes or a string of 24 hex characters or an integer'
      )
  }
})

app.put('/messages/:id', async (req, res) => {
  const participants = await db.collection('participants').find().toArray()

  const fromSchema = joi
    .array()
    .has(joi.object({ name: req.headers.user }).unknown())

  const validationBody = messagesSchema.validate(req.body)
  const validationHeaders = fromSchema.validate(participants)
  const validationId = idSchema.validate(req.params)

  if (validationBody.error || validationHeaders.error || validationId.error)
    return res.sendStatus(422)

  const id = stripHtml(req.params.id).result
  const to = stripHtml(req.body.to).result
  const text = stripHtml(req.body.text).result
  const type = stripHtml(req.body.type).result
  const from = stripHtml(req.headers.user).result

  try {
    const findMessages = await db
      .collection('messages')
      .findOne({ _id: ObjectId(id) })

    if (findMessages === null) return res.sendStatus(404)

    if (findMessages.from !== from) return res.sendStatus(401)
  } catch (error) {
    return res
      .status(500)
      .send(
        'Argument passed in must be a string of 12 bytes or a string of 24 hex characters or an integer'
      )
  }

  const messageToSend = {
    from,
    to,
    text,
    type,
    time: dayjs().format('HH:mm:ss')
  }

  await db
    .collection('messages')
    .updateOne({ _id: ObjectId(id) }, { $set: messageToSend })

  res.sendStatus(200)
})

app.listen(5000)

function messagesToSend(limit, array) {
  if (limit === undefined) {
    return array
  }
  return array.slice(-limit)
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
