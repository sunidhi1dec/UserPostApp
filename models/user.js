const mongoose=require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/myapp');

const userSchema=new mongoose.Schema({
    username:String,
    name:String,
    email:String,
    age:Number,
    password:String,
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    profilepic:{
        type:String,
        default:"default.jpg"
    },
    posts:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:'post'
        }
    ]
});

module.exports=mongoose.model('user', userSchema);