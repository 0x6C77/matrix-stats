var fs = require('fs'),
    path = require('path')
    matrix = require('matrix-js-sdk');

// Load and check settings file exists
var settingsPath = path.resolve(__dirname, 'settings.json');
if (!fs.existsSync(settingsPath)) {
    console.log('settings.json not found');
    process.exit(1);
}
var settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (!settings.room || !settings.homeserver) {
    console.log('Missing rooms or homeserver in settings.json');
    process.exit(1);
}

var processed = 0;


// Load or generate stats
var stats = {
    "processed": null,
    "days": {},
    "hours": {},
    "totals": {
        "lines": 0,
        "words": 0
    },
    "users": { }
};

var statsPath = path.resolve(__dirname, 'stats.json');
if (fs.existsSync(statsPath)) {
    stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
}


process.on('exit', function() {
    console.log("Processed", processed, "new events");
    console.log('Saving stats...');
    fs.writeFileSync(statsPath, JSON.stringify(stats));
});



console.log('Connecting to', settings.homeserver);
var client = matrix.createClient({
    baseUrl: settings.homeserver
});

client.getRoomIdForAlias(settings.room, function (err, data) {
    let roomId = data.room_id;
    console.log('Translated', settings.room, '->', roomId);

    client.on('room', function(event) {
        console.log(event.event.type)
    });

    client.on('Room.timeline', function (evt, room, toStartOfTimeline) {
        // console.log(evt);
        if (room.roomId == roomId) {
            processChunk(evt);
        }
    });

    client.registerGuest({}, function (err, data) {
        console.log('Joined', settings.homeserver);
        client._http.opts.accessToken = data.access_token;
        client.credentials.userId = data.user_id;

        console.log('Peeking', roomId);
        client.peekInRoom(roomId);
        client.stopPeeking();
    });
});

var getUserInfo = function(user_id) {
    return {
        host: user_id.split(":")[1],
        nick: user_id.split(":")[0].substr(1)
    };
};

var processChunk = function(message) {
    if (message.getTs() <= stats.processed) {
        return;
    }

    if (message.getType() == 'm.room.message') {
        if (message.event.content.msgtype == 'm.text') {
            var info = getUserInfo(message.getSender()),
                string = message.event.content.body;

            var date = new Date(message.getTs()),
                words = string.split(' ').length;

            console.log(info.nick, string, date.getHours());

            stats.processed = message.getTs();
            processed++;

            // Store total info
            stats.totals.lines++;
            stats.totals.words += words;

            // Store daily info
            var day = new Date(message.getTs());
            day.setHours(0,0,0,0);

            if (!stats.days[day]) {
                stats.days[day] = 1;
            } else {
                stats.days[day]++;
            }

            // Store hourly info
            if (!stats.hours[date.getHours()]) {
                stats.hours[date.getHours()] = 1;
            } else {
                stats.hours[date.getHours()]++;
            }

            // Store user info
            if (!stats.users[info.nick]) {
                stats.users[info.nick] = {
                    lines: 0,
                    words: 0
                }
            }
            stats.users[info.nick].lines++;
            stats.users[info.nick].words += words;
            stats.users[info.nick].last = date;

            // Store user hour info
            if (!stats.users[info.nick].hours) {
                stats.users[info.nick].hours = {};
            }
            if (!stats.users[info.nick].hours[date.getHours()]) {
                stats.users[info.nick].hours[date.getHours()] = 1;
            } else {
                stats.users[info.nick].hours[date.getHours()]++;
            }
        }
    }
};

