import { createSocket } from './socket.js'

const $ = (x) => document.querySelector(x)
const esc = (x) => {
  const txt = document.createTextNode(x)
  const p = document.createElement('p')
  p.appendChild(txt)
  return p.innerHTML
}

const ws = await createSocket()
const debounceTime = 1000
let base = Math.floor(Math.random() * 50 + 30)
const noise = Math.floor(Math.random() * 10 - 5)

if (!sessionStorage.getItem('peopleOnline')) {
  sessionStorage.setItem('peopleOnline', base)
} else {
  base = +sessionStorage.getItem('peopleOnline')
}

let timeout

const $peopleOnline = $('#peopleOnline p span')
const $skipBtn = $('#skip-btn')
const $sendBtn = $('#send-btn')
const $msgs = $('#messages')
const $msgArea = $('#message-area')
const $typing = $('#typing')
const $input = $('#message-input')
const $downloadChatBtn = $('#downloadChatBtn')

function configureChat() {
  $input.focus()

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $skipBtn.click()
      e.preventDefault()
    }
  })
  $input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      clearInterval(timeout)
      ws.emit('typing', false)
      $sendBtn.click()
      return e.preventDefault()
    }
    ws.emit('typing', true)
  })
  $input.addEventListener('keyup', function (e) {
    clearInterval(timeout)
    timeout = setTimeout(() => {
      ws.emit('typing', false)
    }, debounceTime)
  })
}

const initializeConnection = () => {
  $downloadChatBtn.removeEventListener('click', downloadChat);
  $msgs.innerHTML = `
    <div class="message-status">Looking for people online...</div>
  `
  $downloadChatBtn.style.display = 'none';
  $sendBtn.disabled = true
  $input.value = ''
  $input.disabled = true

  ws.emit('peopleOnline')
  const params = new URLSearchParams(window.location.search)
  const interests =
    params
      .get('interests')
      ?.split(',')
      .filter((x) => !!x)
      .map((x) => x.trim()) || []
  ws.emit('match', { data: 'text', interests })
}

$skipBtn.addEventListener('click', async () => {
  ws.emit('disconnect')
  initializeConnection()
})

$sendBtn.addEventListener('click', () => {
  const msg = $input.value.trim()
  if (!msg) return

  const msgE = document.createElement('div')
  msgE.className = 'message'
  msgE.innerHTML = `<span class="you">You:</span> ${esc(msg)}`

  $msgs.appendChild(msgE)
  $msgArea.scrollTop = $msgArea.scrollHeight
  $input.value = ''

  ws.emit('message', esc(msg))
})

ws.register('peopleOnline', async (data) => {
  $peopleOnline.innerHTML = base + noise + +data
})

ws.register('connected', async (data) => {
  const params = new URLSearchParams(window.location.search)
  const interests =
    params
      .get('interests')
      ?.split(',')
      .filter((x) => !!x)
      .map((x) => x.trim()) || []

  let commonInterests = data.at(-1) || ''
  const first = data.slice(0, -1)
  if (first.length) {
    commonInterests = `${first.join(', ')} and ${commonInterests}`
  }

  $msgs.innerHTML = ''
  const status = document.createElement('div')
  status.className = 'message-status'
  status.innerHTML = 'You are now talking to a random stranger'
  $msgs.appendChild(status)
  if (commonInterests) {
    const status = document.createElement('div')
    status.className = 'message-status'
    status.innerHTML = `You both like ${esc(commonInterests)}`
    $msgs.appendChild(status)
  } else if (interests.length) {
    const status = document.createElement('div')
    status.className = 'message-status'
    status.innerHTML =
      "Couldn't find anyone with similar interests, so this stranger is completely random. Try adding more interests!"
    $msgs.appendChild(status)
  }
  $msgArea.scrollTop = $msgArea.scrollHeight
  $sendBtn.disabled = false
  $input.disabled = false
})

ws.register('message', async (msg) => {
  if (!msg) return

  const msgE = document.createElement('div')
  msgE.className = 'message'
  msgE.innerHTML = `<span class="strange">Stranger:</span> ${esc(msg)}`

  $msgs.appendChild(msgE)
  $msgArea.scrollTop = $msgArea.scrollHeight
})

ws.register('typing', async (isTyping) => {
  $typing.style.display = isTyping ? 'block' : 'none'
  $msgArea.scrollTop = $msgArea.scrollHeight
})


ws.register('disconnect', async (data) => {
  console.log('received disconnect request')
  $input.disabled = true
  const disconnectMsg = document.createElement('div')
  disconnectMsg.className = 'message-status';
  disconnectMsg.textContent = `Stranger disconnected...`;
  $msgs.appendChild(disconnectMsg);
  console.log('chatId: ', data);
  if(data.id) {
      $downloadChatBtn.style.display = 'block';
    $downloadChatBtn.scrollTop = $msgArea.scrollHeight;
    $downloadChatBtn.addEventListener('click', downloadChat);
  } else {
    initializeConnection()
  }
})

const downloadChat = async () => {
  const url = `/downloadChatHistory`;
    console.log("sending post request to: ", url);
  
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'chatHistory.txt';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      console.error('Error downloading chat history:', response.statusText);
    }
};

configureChat()
initializeConnection()