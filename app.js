const express=require('express');
const app=express();
const path=require('path');
const userModel=require('./models/user');
const cookieParser=require('cookie-parser');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const postModel=require('./models/post');
const {upload}=require('./config/multerConfig');
const {body,validationResult} = require('express-validator');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Notes App API",
            version: "1.0.0",
            description: "API documentation for Notes App with Auth & Admin"
        },
        servers: [
            {
                url: "http://localhost:3000"
            }
        ]
    },
    apis: ["./app.js"],
};

const swaggerSpec = swaggerJsdoc(options);

app.set('view engine','ejs');
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'public')));
app.use(express.json());
app.use(cookieParser());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


app.get('/', function(req,res){
    res.render('index');
});

app.get('/login',function(req,res){
    res.render('login');
});

app.get('/profile',isLoggedIn,async function(req,res){
    let user=await userModel.findOne({email:req.user.email}).populate('posts');
    res.render('profile',{
        user,
        loggedInUser: req.user
    });
});
app.get('/profile/upload',isLoggedIn,function(req,res){
    res.render('profilepic');
});

app.post('/upload',upload.single('image'),isLoggedIn,async function(req,res){
    let user=await userModel.findOne({email:req.user.email});
    user.profilepic=req.file.filename;
    await user.save();
    res.redirect('/profile');
});

/**
 * @swagger
 * /like/{id}:
 *   get:
 *     summary: Like or Unlike a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post liked/unliked successfully
 */
app.get('/like/:id',isLoggedIn,async function(req,res){
    let post=await postModel.findOne({_id:req.params.id}).populate('user');

    if(post.likes.indexOf(req.user.userid)===-1){
        post.likes.push(req.user.userid);
    }
    else{
        post.likes.splice(post.likes.indexOf(req.user.userid),1);
    }
    await post.save();
    res.redirect('/profile');
});
/**
 * @swagger
 * /edit/{id}:
 *   get:
 *     summary: Get edit page for a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Edit page loaded
 */
app.get('/edit/:id',isLoggedIn,async function(req,res){
    let post=await postModel.findOne({_id:req.params.id}).populate('user');

    res.render('edit',{post});
});

/**
 * @swagger
 * /delete/{id}:
 *   get:
 *     summary: Delete a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post deleted
 */

app.get('/delete/:id', isLoggedIn, async function(req, res) {
    let post = await postModel.findOne({ _id: req.params.id });

    if (!post) return res.send("Post not found");

    if (req.user.role === "user" && post.user.toString() !== req.user.userid) {
        return res.status(403).send("You can delete only your own posts");
    }

    await postModel.findByIdAndDelete(req.params.id);
    res.redirect('/profile');
});
/**
 * @swagger
 * /update/{id}:
 *   post:
 *     summary: Update a post
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Post updated successfully
 */
app.post('/update/:id',isLoggedIn,async function(req,res){
    let post=await postModel.findOneAndUpdate({_id:req.params.id},{content:req.body.content});
    res.redirect('/profile');
});

/**
 * @swagger
 * /post:
 *   post:
 *     summary: Create a post
 *     tags: [Posts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Post created
 */

app.post('/post',isLoggedIn,async function(req,res){
    try{
        let user=await userModel.findOne({email:req.user.email});
        let post=await postModel.create({
            user:user._id,
            content:req.body.content
        });
        user.posts.push(post._id);
        await user.save();
        res.redirect('/profile');
    }catch(err){
        console.log(err);
        res.send("Error creating post");
    }
});

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */

app.post('/login',

[
    body('email')
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email'),

    body('password')
        .notEmpty().withMessage('Password is required')
],

async function(req,res){

    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).send(errors.array()[0].msg);
    }

    let {email, password} = req.body;

    let user = await userModel.findOne({ email });

    if(!user){
        return res.status(400).send('Invalid Credentials');
    }

    bcrypt.compare(password, user.password, function(err, result){
        if(result){
            let token = jwt.sign(
                { email: email, userid: user._id, role: user.role },
                process.env.JWT_SECRET
            );

            res.cookie("token", token);
            res.redirect('/profile');
        }
        else{
            return res.status(400).send('Invalid Credentials');
        }
    });
});   

app.get('/logout',function(req,res){
    res.clearCookie("token");
    res.redirect('/login');
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - username
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               username:
 *                 type: string
 *               age:
 *                 type: integer
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User registered successfully
 */

app.post('/register',

[
    body('name')
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 3 }).withMessage('Name must be at least 3 characters'),

    body('username')
        .notEmpty().withMessage('Username is required')
        .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),

    body('email')
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Enter a valid email'),

    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

    body('age')
        .optional()
        .isInt({ min: 1 }).withMessage('Age must be a positive number')
],

async function(req,res){

    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).send(errors.array()[0].msg);
    }

    let {name, username, age, email, password} = req.body;

    email = email.trim().toLowerCase();

    let existingUser = await userModel.findOne({ email });

    if(existingUser){
        return res.status(400).send('User already registered');
    }

    bcrypt.genSalt(10, function(err, salt){
        bcrypt.hash(password, salt, async function(err, hash){

            let user = await userModel.create({
                name,
                username,
                email,
                age,
                password: hash,
                role: "user"
            });

            let token = jwt.sign(
                { email: email, userid: user._id, role: user.role },
                process.env.JWT_SECRET
            );

            res.cookie("token", token);
            res.redirect('/login');
        });
    });
});

/**
 * @swagger
 * /admin/posts:
 *   get:
 *     summary: Get all posts (Admin only)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of all posts
 *       403:
 *         description: Access denied
 */

//admin access
app.get('/admin/posts', isLoggedIn, isAdmin, async function(req, res) {
    try {
        let posts = await postModel.find().populate('user');

        res.render('allposts', { posts });

    } catch (err) {
        res.send("Error fetching posts");
    }
});

function isAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).send("Access denied: Admin only");
    }
    next();
}

//this is created because if need to go on any protected route then with the help of this we can 
//for ex: to access profile route we want only if you are logged in then only you can access it - so we apply this
//if we are not logged in- then we try to access the profile route i.e protected route we wont be able to access it
function isLoggedIn(req,res,next){
    if(!req.cookies || !req.cookies.token || req.cookies.token==="") {
        return res.redirect('/login');
    }
    try{
        let data = jwt.verify(req.cookies.token, process.env.JWT_SECRET_KEY);
        req.user=data;
        next();
    } catch(err){
        res.send("Invalid or expired token. Please login again.");
    }
}

// Initialize app and update existing users without role field
(async () => {
    try {
        await userModel.updateMany(
            { role: { $exists: false } },
            { $set: { role: "user" } }
        );
    } catch(err) {
        console.log("Error updating user roles:", err);
    }
})();

app.listen(3000);