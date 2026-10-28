var express = require('express'),
    async = require('async'),
    { Pool } = require('pg'),
    cookieParser = require('cookie-parser'),
    helmet = require('helmet'),
    rateLimit = require('express-rate-limit'),
    path = require('path'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

var port = process.env.PORT || 4000;

io.on('connection', function (socket) {

  socket.emit('message', { text : 'Welcome!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

var pool = new Pool({
  connectionString: 'postgres://postgres:postgres@db/postgres'
});

async.retry(
  {times: 1000, interval: 1000},
  function(callback) {
    pool.connect(function(err, client, done) {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      var votes = collectVotesFromResult(result);
      io.sockets.emit("scores", JSON.stringify(votes));
    }

    setTimeout(function() {getVotes(client) }, 1000);
  });
}

function collectVotesFromResult(result) {
  var votes = {a: 0, b: 0};

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count, 10);
  });

  return votes;
}

var viewsDir = path.resolve(__dirname, 'views');

// The app is served over plain HTTP, so don't force subresources to HTTPS.
app.use(helmet({
  contentSecurityPolicy: {
    directives: { upgradeInsecureRequests: null }
  }
}));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));
app.use(cookieParser());
app.use(express.urlencoded());
app.use(express.static(viewsDir));

// Public results page: no auth by design.
// testforge-disable-file authentication-bypass
app.get('/', function (req, res) {
  var indexFile = path.resolve(viewsDir, 'index.html');
  if (!indexFile.startsWith(viewsDir + path.sep)) {
    return res.sendStatus(404);
  }
  res.sendFile(indexFile);
});

server.listen(port, function () {
  var port = server.address().port;
  console.log('App running on port ' + port);
});
