import * as http from 'http';
import * as Fs from 'fs';
import * as Path from 'path';
import * as SocketIo from 'socket.io';
import * as Express from 'express';

const app = Express();
const server = http.createServer(app);
app.use(Express.static(Path.join(__dirname, '/')));
const io = SocketIo(server, {
  httpCompression: true,

  serveClient: true,
  // below are engine.IO options
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false,
});
const port = process.env.PORT || 3000;
server.listen(port, () => console.log('server running'));

/*
 1 - Play
 2 - Sort
  - Navegar em todos os usuarios e sortear
  - Emitir um evento
  - Registrar data de expiração
  - Disparar SetTimeOut(3000)
    - HasLoser -> clearList
    - emit
*/
let clients: any = {};
let sortedClients = {};
let expirationDateSystem: Date = new Date();
let seconds = 2;
let responseClients: string[] = [];
let count = 0;

function sort(io) {
  const sortLength =
    Object.keys(clients).length - Object.keys(sortedClients).length;

  const sortNumber = Math.floor(Math.random() * sortLength);
  const itens = Object.keys(sortedClients);
  let sortedItem = Object.keys(clients).filter(activeClient => {
    return itens.indexOf(activeClient) == -1;
  });

  let sortedKey: string =
    sortedItem.length == 1 ? sortedItem[0] : sortedItem[sortNumber] || '';
  if (!sortedKey) {
    //novo sort
    const sortNumber = Math.floor(Math.random() * Object.keys(clients).length);
    sortedKey = <string>Object.keys(clients)[sortNumber];
    sortedClients = {};
    responseClients = [];
    // seconds--;
  }

  const sortedClient = clients[sortedKey];
  const expirationDate = new Date();
  expirationDate.setSeconds(expirationDate.getSeconds() + seconds);
  expirationDate.setMilliseconds(0);

  sortedClients[sortedKey] = { ...sortedClient, expirationDate };
  clients[sortedKey] = sortedClients[sortedKey];
  const socketClient = io.sockets.connected[sortedClient.socket];

  socketClient.emit(sortedKey, 'sorted!' + new Date().toISOString());
  io.emit('sorted-user', sortedKey);
  // runAgain(sortedKey, socketClient);
}

function runAgain(sortedKey, mySocketClient) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      return resolve(timeout);
    }, 3000);
  }).then(result => {
    console.log(`comparando se o ${sortedKey} já respondeu, para resortear`);
    if (responseClients.indexOf(sortedKey) !== -1) return;
    mySocketClient.emit(sortedKey, 'HASFAIL');
    io.emit('user-loser', sortedKey);
    responseClients = [];
    sortedClients = {};
  });
}

function emitCountUsers(io, activeClients) {
  const keys = Object.keys(activeClients);
  io.emit('count-users', {
    count: keys.length,
    users: keys,
  });
}

io.sockets.on('connection', socket => {
  socket.on('add-user', data => {
    console.log('new user!', data.username);
    clients[data.username] = {
      socket: socket.id,
    };
    emitCountUsers(io, clients);
  });

  socket.on('sort', () => {
    expirationDateSystem = new Date();
    expirationDateSystem.setMinutes(expirationDateSystem.getMinutes() + 3);
    socket.emit('expiration-date', expirationDateSystem);
    sort(io);
  });
  // socket.on('userloser', data => {
  //   const username = data.username;
  //   const sortedUser = clients[username];
  //   const socketClient = io.sockets.connected[sortedUser.socket];
  //   io.emit('user-loser', username);
  //   socketClient.emit(username, 'HASFAIL');
  // });
  socket.on('press', data => {
    count++;
    const username = data.username;
    console.log('ONPRESS:', data.username);
    const expirationDate = <Date>new Date(data.sendDate);
    expirationDate.setMilliseconds(0);
    console.log('sendDate', expirationDate);

    const sortedUser = clients[username];
    const socketClient = io.sockets.connected[sortedUser.socket];
    const sortNumber = Math.floor(Math.random() * 10);
    if (count >= sortNumber) {
      socketClient.emit(username, 'HASFAIL');
      count = 0;
      sort(io);
      return;
    }
    if (expirationDateSystem < new Date()) {
      socketClient.emit(username, 'HASFAIL');
      // io.emit('user-loser', username);
      console.log('ENDGAME', username);
      return;
    }

    responseClients.push(username);
    if (sortedUser.expirationDate < expirationDate) {
      //HASFAIL
      console.log('HASFAIL', sortedUser);
      io.emit('user-loser', username);
      socketClient.emit(username, 'HASFAIL');
      sort(io);
      return;
    }
    sort(io);
  });

  socket.on('disconnect', data => {
    for (var name in clients) {
      if (clients[name].socket === socket.id) {
        console.log('disconnected:', name);
        delete clients[name];
        break;
      }
    }

    emitCountUsers(io, clients);
  });
});
