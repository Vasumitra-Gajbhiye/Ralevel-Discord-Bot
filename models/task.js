const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
    taskId: { type: String, required: true, unique: true },

    title: { type: String, required: true },
    description: { type: String, required: true },

    team: {
        type: String,
        enum: ["graphic", "dev", "writer"],
        required: true
    },

    createdBy: { type: String, required: true },

    // MULTIPLE CLAIMANTS SUPPORT
    assignedTo: { type: [String], default: [] },

    // MULTIPLE DESIGNERS CAN FINISH
    finishedBy: { type: [String], default: [] },

    // FINISHED LINKS (array matching finishedBy)
    finishedLinks: { type: [String], default: [] },

    selected: { type: String, default: null }, // graphic and writer only

    status: {
        type: String,
        enum: ["open", "claimed", "completed"],
        default: "open"
    },

    // GRAPHIC FIELDS
    resolution: { type: String, default: null },
    fileFormat: { type: String, default: null },
    notes: { type: String, default: null },
    fileNameFormat: { type: String, default: null },  
    
    // WRITER FIELDS
    wordLimit: { type: String, default: null },
    

    // ALL TEAMS
    deadline: { type: String, default: null },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Task", taskSchema);