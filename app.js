import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import mongoose from 'mongoose';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// import db from './db/sqlite.js'
import * as fs from 'fs';

import * as https from 'https';

import * as http from 'http';
import { OpenAI } from 'openai';
import { config } from 'dotenv';

import axios from 'axios';

config();

var privateKey = fs.readFileSync('public/private.key', 'utf8');
var certificate = fs.readFileSync('public/certificate.crt', 'utf8');

var credentials = { key: privateKey, cert: certificate };
const url = 'mongodb://localhost:27017/chatLogs';

// Define a schema
const ChatSchema = new mongoose.Schema({
  chatId: String,
  timestamp: { type: Date, default: Date.now },
  messages: [{
    message: String,
    timestamp: Date,
    ip: String
  }]
});

// Define a model
const Chat = mongoose.model('Chat', ChatSchema);

// Connect to MongoDB
mongoose.connect(url);

const SERVER_PORT = 8080;

if (!SERVER_PORT) {
  throw new Error('Forgot to initialze some variables')
}

Array.prototype.random = function () {
  return this[Math.floor(Math.random() * this.length)]
}

Array.prototype.shuffle = function () {
  for (let i = this.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[this[i], this[j]] = [this[j], this[i]]
  }
  return this
}

// WebSocket.prototype.init = function () {
//   this.channels = new Map()
//   this.on('message', (message) => {
//     try {
//       const { channel, data } = JSON.parse(message.toString())
//       this.propagate(channel, data)
//     } catch (e) {
//       console.error(e)
//     }
//   })
// }

WebSocket.prototype.register = function (channel, callback) {
  this.channels.set(channel, callback)
}

// WebSocket.prototype.propagate = function (channel, data, ip) {
//   const callback = this.channels.get(channel)
//   if (callback) {
//     callback(data)
//   } else if (this.peer) {
//     // redirect message to peer
//     try {

//     // Create and save a new Chat
//     const chat = new Chat({ message: data, ip });
//     await chat.save();

//     console.log("Chat logged successfully");

//     // Close the MongoDB connection
//     await mongoose.connection.close();

//   } catch (e) {
//     console.error(e)
//   }
//     return this.peer.send(JSON.stringify({ channel, data }))
//   }
// }

const app = express()

app.use(express.static('./public', { extensions: ['html'] }))
app.use(express.json())
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(8080);
httpsServer.listen(8443);

const wss = new WebSocketServer({ server: httpsServer })

app.get('/online', (_, res) => {
  res.send({ online: wss.clients.size })
})

app.post('/downloadChatHistory', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log("requestor ip: ", ip);
  console.log("peer ip: ", req.body.peerIp)

  // Replace this with your actual query
  Chat.findOne({ 'messages.ip': ip }).sort({ timestamp: -1 }).limit(1)
    .then(chat => {
      if (chat) {
        chat.messages.forEach(element => {
          console.log(element);
        });
        const chatHistory = chat.messages.map(message => `${message.ip === ip ? 'You' : 'Other person'}: ${message.message}`).join('\n');
        const filePath = path.join(__dirname, 'chatHistory.txt');
        fs.writeFileSync(filePath, chatHistory);
        res.download(filePath, err => {
          if (err) {
            console.error(err);
            res.status(500).send('Error downloading the file.');
          }
          fs.unlinkSync(filePath);
        });
      } else {
        console.log("Chat history not found.");
        res.status(404).send('Chat history not found.');
      }
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Error retrieving chat history.');
    });
});


const sleep = (x) => new Promise((r) => setTimeout(() => r(), x))

async function findPeer(user, interests, interestUserMap, userInterestMap) {
  // sleep for 1 to 2 seconds
  await sleep(Math.floor(Math.random() * 1000 + 1000))
  // find random stranger
  if (!interests || !interests.length) {
    const peers = Array.from(userInterestMap.keys())
    if (!peers || !peers.length) return [undefined, []]

    let peer = peers.random()
    if (peers.length === 1 && peer === user) return [undefined, []]
    while (peer === user) {
      peer = peers.random()
    }
    return [peer, []]
  }

  // find stranger with matching interests
  for (const i of interests.shuffle()) {
    const peers = Array.from(interestUserMap.get(i) || [])
    if (!peers || !peers.length) continue

    let peer = peers.random()
    if (peers.length === 1 && peer === user) continue
    while (peer === user) {
      peer = peers.random()
    }

    const peerInterests = new Set(userInterestMap.get(peer))
    const commonInterests = [...new Set(interests)].filter((x) =>
      peerInterests.has(x)
    )

    return [peer, commonInterests]
  }

  // couldn't find stranger's with common interests
  // wait to see if other's are active
  addUser(user, interests, interestUserMap, userInterestMap)
  await sleep(6000)
  if (user.peer) return [user.peer, []]

  // look for random peer
  deleteUser(user, interestUserMap, userInterestMap)
  return findPeer(user, [], interestUserMap, userInterestMap)
}

function addUser(user, interests, interestUserMap, userInterestMap) {
  userInterestMap.set(user, interests)
  interests.forEach((i) => {
    const users = interestUserMap.get(i)
    if (!users || !users.size) {
      return interestUserMap.set(i, new Set([user]))
    }
    users.add(user)
  })
}

function deleteUser(user, interestUserMap, userInterestMap) {
  const userInterests = userInterestMap.get(user)
  if (!userInterests) return
  userInterests.forEach((interest) => {
    const users = interestUserMap.get(interest)
    if (!users || !users.size) return

    users.delete(user)
  })
  userInterestMap.delete(user)
}

wss.textUserInterestMap = new Map()
wss.textInterestUserMap = new Map()
wss.videoUserInterestMap = new Map()
wss.videoInterestUserMap = new Map()
wss.on('connection', (ws, req) => {
  console.log('new connection')

  const ip = req.connection.remoteAddress;

  ws.propagate = async function (channel, data, ip) {
    const callback = this.channels.get(channel)
    if (callback) {
      callback(data)
    } else if (this.peer) {
      // redirect message to peer
      // Save the message to the database
      try {
        if (data.toString() != "true" && data.toString() != "false") {
          // console.log("text will be: ", data)

          const selfIpInfo = this._socket.remoteAddress + ":" + this._socket.remotePort;
          const peerIpInfo = this.peer._socket.remoteAddress + ":" + this.peer._socket.remotePort;

          const chatIdSelf = selfIpInfo + peerIpInfo;
          const chatIdPeer = peerIpInfo + selfIpInfo;

          const content = { message: data, timestamp: new Date(), ip: ip };

          const options = {
            method: "POST",
            url: "https://api.edenai.run/v2/text/moderation",
            headers: {
              authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTNkOTZkYmEtMmM5Ni00M2RlLTljYmMtYzc4MDQ3MTQxNGVmIiwidHlwZSI6ImFwaV90b2tlbiJ9.z_GMUtu_0owVAmeLf8T4ypTtedGwuM9bmMxX_Y98o2k",
            },
            data: {
              show_original_response: false,
              fallback_providers: "",
              providers: "microsoft",
              language: "en",
              text: data,
            },
          };

          axios
            .request(options)
            .then((response) => {
              console.log(response.data);
            })
            .catch((error) => {
              console.error(error);
            });

          let chatSelf = await Chat.findOne({ chatId: chatIdSelf });
          let chatPeer = await Chat.findOne({ chatId: chatIdPeer });

          let chat, chatId;

          if (chatSelf) {
            chat = chatSelf;
            chatId = chatIdSelf;
          } else {
            chat = chatPeer;
            chatId = chatIdPeer;
          }

          // console.log("chatId: ", chatId)
          if (chat) {
            // console.log("chat exists")
            // If chat document exists, update it
            chat.messages.push(content);
          } else {
            // console.log("chat doesn't exist")

            // If chat document doesn't exist, create it
            chat = new Chat({ chatId: chatId, messages: [content] });
          }
          // console.log("chat json ", JSON.stringify(chat))
          await chat.save();

          console.log("Chat logged successfully");
        }

      } catch (error) {
        console.error(error);
      }
      return this.peer.send(JSON.stringify({ channel, data }))
    }
  }

  ws.init = function (req) {
    this.channels = new Map()
    this.on('message', async (message) => {
      const { channel, data } = JSON.parse(message.toString())
      if( channel === 'message' ) {
        ws.hasSentData = true;
      }
      this.propagate(channel, data, ip)
    })
  }

  ws.init()

  ws.register('peopleOnline', () => {
    ws.send(JSON.stringify({ channel: 'peopleOnline', data: wss.clients.size }))
  })



  ws.register('match', async ({ data, interests }) => {
    interests = interests.map((x) => x.trim().toLowerCase())
    ws.interestUserMap =
      data === 'video' ? wss.videoInterestUserMap : wss.textInterestUserMap
    ws.userInterestMap =
      data === 'video' ? wss.videoUserInterestMap : wss.textUserInterestMap
    const [peer, commonInterests] = await findPeer(
      ws,
      interests,
      ws.interestUserMap,
      ws.userInterestMap
    )
    // if peer exist
    if (ws.peer) return

    if (!peer) {
      console.log('No peers found')
      console.log(
        `Pushing ${req.socket.remoteAddress}:${req.socket.remotePort} to queue`
      )
      return addUser(ws, interests, ws.interestUserMap, ws.userInterestMap)
    }

    console.log('peer available:')
    console.log(
      `matching ${req.socket.remoteAddress}:${req.socket.remotePort} now`
    )
    deleteUser(peer, peer.interestUserMap, peer.userInterestMap)
    // set peer
    ws.peer = peer
    peer.peer = ws

    ws.send(JSON.stringify({ channel: 'connected', data: commonInterests }))
    ws.peer.send(
      JSON.stringify({ channel: 'connected', data: commonInterests })
    )
    if (data === 'video') {
      ws.send(JSON.stringify({ channel: 'begin', data: '' }))
    }
  })

  ws.register('disconnect', async () => {
    if (!ws.peer) return
    // Send a message to the client-side code to add the download button
    // ws.send(JSON.stringify({ channel: 'addDownloadButton', 
    //
    // var content =  {self: ws.socket.remoteAddress + ":" + self.socket.remotePort, other: ws.peer.socket.remoteAddress + ":" + ws.peer.socket.remotePort};
    // console.log("content in disc: ", content) 
    ws.peer.send(JSON.stringify({ channel: 'disconnect', data: '' }));
    ws.peer.peer = undefined
    ws.peer = undefined;
  })

  ws.on('close', () => {
    console.log(
      `${req.socket.remoteAddress}:${req.socket.remotePort} disconnected`
    )

    if (ws.peer) {
      var chatId = { self: ws.peer._socket.remoteAddress + ":" + ws.peer._socket.remotePort, other: req.socket.remoteAddress + ":" + req.socket.remotePort };
      const selfIpInfo = ws.peer._socket.remoteAddress + ":" + ws.peer._socket.remotePort;
      const peerIpInfo = req.socket.remoteAddress + ":" + req.socket.remotePort;

      const chatIdSelf = selfIpInfo + peerIpInfo;
      const chatIdPeer = peerIpInfo + selfIpInfo;
      
      //check if any messages were sent between the users
      var id;;
      Chat.findOne({ 'chatId': { $in: [chatIdSelf, chatIdPeer] } }).sort({timestamp: -1})
        .then(chat => {
           if (chat) {
            id = chat._id;
            console.log("chatId: ", chatId)
           } else {
            console.log("Chat history not found.");
           }
        })
      ws.peer.send(JSON.stringify({ channel: 'disconnect', data: {id: id} }));
      ws.peer.peer = undefined
    }
    if (!ws.interestUserMap || !ws.userInterestMap) return
    deleteUser(ws, ws.interestUserMap, ws.userInterestMap)
  })
})
