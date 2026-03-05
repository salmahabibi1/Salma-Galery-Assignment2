const express = require('express');
const exphbs = require('express-handlebars');
const fs = require('fs');
const path = require('path');
const linebyline = require('linebyline');
const sessions = require('client-sessions');
const randomstring = require('randomstring');

const app = express();
const PORT = 3000;
const userFilePath = path.join(__dirname, 'user.json');

// Configure Handlebars with custom helper
app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: false,
    helpers: {
        eq: function(a, b) {
            return a === b;
        }
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(sessions({
    cookieName: 'session',
    secret: randomstring.generate(64),
    duration: 30 * 60 * 1000,
    activeDuration: 5 * 60 * 1000,
    httpOnly: true
}));

// Function to read image list from file
function readImageList() {
    return new Promise((resolve, reject) => {
        const images = [];
        const liner = linebyline(path.join(__dirname, 'imagelist.txt'));
        
        liner.on('line', (line) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                // Extract filename without extension for label
                const nameWithoutExt = trimmedLine.replace(/\.[^/.]+$/, '');
                images.push({
                    filename: trimmedLine,
                    label: nameWithoutExt
                });
            }
        });
        
        liner.on('end', () => {
            resolve(images);
        });
        
        liner.on('error', (err) => {
            reject(err);
        });
    });
}

function readUsers() {
    if (!fs.existsSync(userFilePath)) {
        return {};
    }

    const fileContent = fs.readFileSync(userFilePath, 'utf8');
    if (!fileContent.trim()) {
        return {};
    }

    return JSON.parse(fileContent);
}

function writeUsers(users) {
    fs.writeFileSync(userFilePath, JSON.stringify(users, null, 4), 'utf8');
}

function ensureAuthenticated(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }

    next();
}

app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/gallery');
    }

    res.render('login', {
        pageTitle: 'Image Gallery Collection',
        errorMessage: ''
    });
});

app.get('/register', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/gallery');
    }

    res.render('register', {
        pageTitle: 'Image Gallery Collection',
        errorMessage: '',
        successMessage: ''
    });
});

app.post('/login', (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    try {
        const users = readUsers();

        if (!users[username]) {
            return res.status(401).render('login', {
                pageTitle: 'Image Gallery Collection',
                errorMessage: 'Not a registered username'
            });
        }

        if (users[username] !== password) {
            return res.status(401).render('login', {
                pageTitle: 'Image Gallery Collection',
                errorMessage: 'Invalid password'
            });
        }

        req.session.user = {
            username,
            loginToken: randomstring.generate(16)
        };

        return res.redirect('/gallery');
    } catch (error) {
        console.error('Error validating login credentials:', error);
        return res.status(500).render('login', {
            pageTitle: 'Image Gallery Collection',
            errorMessage: 'Server error during login'
        });
    }
});

app.post('/register', (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const confirmPassword = req.body.confirmPassword || '';

    if (!username || !password || !confirmPassword) {
        return res.status(400).render('register', {
            pageTitle: 'Image Gallery Collection',
            errorMessage: 'All fields are required',
            successMessage: ''
        });
    }

    if (password !== confirmPassword) {
        return res.status(400).render('register', {
            pageTitle: 'Image Gallery Collection',
            errorMessage: 'Passwords do not match',
            successMessage: ''
        });
    }

    try {
        const users = readUsers();

        if (users[username]) {
            return res.status(409).render('register', {
                pageTitle: 'Image Gallery Collection',
                errorMessage: 'Username already registered',
                successMessage: ''
            });
        }

        users[username] = password;
        writeUsers(users);

        return res.status(201).render('register', {
            pageTitle: 'Image Gallery Collection',
            errorMessage: '',
            successMessage: 'Account created successfully. You can now login.'
        });
    } catch (error) {
        console.error('Error during registration:', error);
        return res.status(500).render('register', {
            pageTitle: 'Image Gallery Collection',
            errorMessage: 'Server error during registration',
            successMessage: ''
        });
    }
});

app.get('/gallery', ensureAuthenticated, async (req, res) => {
    try {
        const images = await readImageList();
        const defaultImage = images.length > 0 ? images[0].filename : null;
        
        res.render('gallery', {
            images: images,
            selectedImage: defaultImage,
            pageTitle: 'Image Gallery Collection',
            username: req.session.user.username
        });
    } catch (error) {
        console.error('Error reading image list:', error);
        res.status(500).send('Error loading gallery');
    }
});

app.post('/display', ensureAuthenticated, async (req, res) => {
    try {
        const images = await readImageList();
        const defaultImage = images.length > 0 ? images[0].filename : null;
        const requestedImage = req.body.imageChoice;
        const imageExists = images.some((image) => image.filename === requestedImage);
        const selectedImage = imageExists ? requestedImage : defaultImage;

        res.render('gallery', {
            images: images,
            selectedImage: selectedImage,
            pageTitle: 'Image Gallery Collection',
            username: req.session.user.username
        });
    } catch (error) {
        console.error('Error processing selection:', error);
        res.status(500).send('Error processing selection');
    }
});

app.get('/logout', (req, res) => {
    req.session.reset();
    res.set('Connection', 'close');
    res.redirect('/');
});

// Start server
app.listen(PORT, () => {
    console.log(`Gallery server is running on http://localhost:${PORT}`);
    console.log(`You can also access it at http://127.0.0.1:${PORT}`);
});
