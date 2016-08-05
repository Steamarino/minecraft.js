var mc = require('minecraft-protocol'),
  express = require('express'),
  http = require('http'),
  path = require('path'),
  WebSocket = require('ws'),
  BSON = new (require('bson').BSONPure.BSON)();

var app = express();
app.use(express.static(path.resolve('.')));

var httpServer = http.createServer(app);

var wss = new WebSocket.Server({server: httpServer});
wss.on('connection', function(ws) {
  var session = null;
  ws.on('message', function(data) {
    var message = BSON.deserialize(data);
    var packet = message.packet;
    var type = message.type;
    if (type === 'authenticate') {
      mc.yggdrasil.getSession(packet.username, packet.password, mc.yggdrasil.generateUUID(), false, function(err, ses) {
        session = ses;
        ws.send(BSON.serialize({
          type: 'session',
          packet: {
            session: session,
            error: err
          }
        }));
      });
    } else if (type === 'refresh') {
      mc.yggdrasil.getSession(packet.username, packet.accessToken, packet.clientToken, true, function(err, ses) {
        session = ses;
        ws.send(BSON.serialize({
          type: 'session',
          packet: {
            session: session,
            error: err
          }
        }));
      });
    } else if (type === 'connect') {
      if (!session) {
        console.warn('Client has not authenticated');
      }
      packet.username = session ? session.selectedProfile.name : 'Player';
      packet.accessToken = session ? session.accessToken : '';
      packet.clientToken = session ? session.clientToken : '';
      var client = mc.createClient(packet);
      client.on('state', function (state) {
        if (state === mc.states.PLAY) {
          new Proxy(client, ws);
        }
      });
    }
  });

});
httpServer.listen(process.env.PORT || 8080);

function Proxy(server, client) {
  client.on('close', function () {
    server.end();
  });
  server.on('end', function () {
    client.close();
  });
  server.on('packet', function(packet, meta) {
    if (client.readyState !== client.OPEN)
      return client.close();
    var buffer = BSON.serialize({
      type: [meta.state, meta.name],
      packet: packet
    });
    client.send(buffer);
  });
}
