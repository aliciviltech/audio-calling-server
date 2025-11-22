import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import cors from "cors"
import dotenv from "dotenv"

dotenv.config()

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: [
      // "http://localhost:3000",
      // "http://localhost:3001",
      // process.env.CLIENT_URL || "https://v0-audio-calling-app-bt.vercel.app",
      "https://audio-calling-client.vercel.app"
    ],
    methods: ["GET", "POST"],
  },
})

app.use(cors())
app.use(express.json())

// Store active rooms and their users
const rooms = new Map()

app.get("/", (req, res) => {
  res.send("Audio Call Server is running")
})

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`)

  socket.on("join-room", (data) => {
    const { roomId, email } = data
    console.log(`${email} (${socket.id}) joining room: ${roomId}`)

    socket.join(roomId)

    // Store room data
    if (!rooms.has(roomId)) {
      rooms.set(roomId, [])
    }
    rooms.get(roomId).push({
      id: socket.id,
      email,
    })

    // Notify others in the room that a new user joined
    socket.to(roomId).emit("user-joined", {
      userId: socket.id,
      email,
    })

    // Send list of existing users to the new user
    const roomUsers = rooms.get(roomId)
    const otherUsers = roomUsers.filter((user) => user.id !== socket.id)
    socket.emit("room-users", {
      users: otherUsers,
    })

    // Log room status
    console.log(`Room ${roomId} now has ${roomUsers.length} users`)
  })

  // Relay signaling messages
  socket.on("offer", (data) => {
    console.log(`Offer from ${socket.id} to ${data.to}`)
    socket.to(data.to).emit("offer", {
      from: socket.id,
      offer: data.offer,
    })
  })

  socket.on("answer", (data) => {
    console.log(`Answer from ${socket.id} to ${data.to}`)
    socket.to(data.to).emit("answer", {
      from: socket.id,
      answer: data.answer,
    })
  })

  socket.on("ice-candidate", (data) => {
    socket.to(data.to).emit("ice-candidate", {
      from: socket.id,
      candidate: data.candidate,
    })
  })

  socket.on("leave-room", (roomId) => {
    console.log(`User ${socket.id} leaving room ${roomId}`)
    socket.leave(roomId)

    if (rooms.has(roomId)) {
      const roomUsers = rooms.get(roomId)
      const updatedUsers = roomUsers.filter((user) => user.id !== socket.id)
      if (updatedUsers.length > 0) {
        rooms.set(roomId, updatedUsers)
      } else {
        rooms.delete(roomId)
      }
    }

    socket.to(roomId).emit("user-left", {
      userId: socket.id,
    })
  })

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`)

    // Remove user from all rooms
    rooms.forEach((users, roomId) => {
      const updatedUsers = users.filter((user) => user.id !== socket.id)
      if (updatedUsers.length > 0) {
        rooms.set(roomId, updatedUsers)
        io.to(roomId).emit("user-left", {
          userId: socket.id,
        })
      } else {
        rooms.delete(roomId)
      }
    })
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
