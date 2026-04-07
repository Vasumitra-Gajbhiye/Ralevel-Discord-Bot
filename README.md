# r/alevel Discord Bot Dev Guide 

Welcome to the official development guide for the r/alevel Discord Bot. This project involves setting up a local development environment, configuring necessary variables, and following a specific GitHub workflow to contribute.

---

## 🛠 Prerequisites

Before starting, ensure you have the following tools installed on your machine:

* **Git**: [Download for Windows](https://git-scm.com/install/windows) or [Download for Mac](https://git-scm.com/install/mac).
* **Node.js (LTS Version)**: [Download here](https://nodejs.org/en/download).
* **VS Code**: Recommended editor for this project.

---

## 🚀 Initial Setup

### 1. Clone the Repository
Open your terminal and run the following commands:
```bash
git clone https://github.com/Vasumitra-Gajbhiye/Ralevel-Discord-Bot
cd Ralevel-Discord-Bot
```

### 2. Install Dependencies
Install the required packages using npm:
```bash
npm install
```


### 3. Environment Variables Configuration
You must create a `.env` file in the **ROOT** folder (inside `Ralevel-Discord-Bot`) to store configuration settings:

```bash
touch .env
```

#### Required Variables
Copy the Role and Channel IDs provided in the development guide into your `.env` file. You will also need to generate your own keys for the following:

| Variable | Description |
| :--- | :--- |
| `TOKEN` | Your Discord Bot Token |
| `MONGO_URI` | Connection string for MongoDB  |
| `UPSTASH_REDIS_REST_URL` | REST URL from Upstash  |
| `UPSTASH_REDIS_REST_TOKEN` | REST Token from Upstash |

**Important Services:**
* **MongoDB Atlas**: Create a **FREE** cluster and select the region closest to you.
* **Upstash Redis**: Create a Redis database using the **SAME** region as your MongoDB cluster.

---

## 🚦 Running the Bot

To start the bot locally, use:
```bash
node index.js
```


If you have added new commands, you must deploy them using:
```bash
node scripts/deploy-commands.js
```


---

## 🌲 GitHub Workflow

We **DO NOT** work directly on the `main` branch. Please follow this standard workflow:

1.  **Pull Latest Code**: `git pull origin main`
2.  **Create a Branch**: Use the format `feature/<name>` or `fix/<name>`.
    * *Example*: `git checkout -b feature/xp-system` 
3.  **Commit Changes**: Use clear, prefixed commit messages.
    * `feat:` for new features 
    * `fix:` for bug fixes 
    * `refactor:` for code improvements
4.  **Push Branch**: `git push origin feature/<your-feature-name>`
5.  **Open a Pull Request (PR)**: Go to GitHub and click "Compare & pull request".

---

## ⚠️ Essential Rules

* **NEVER push your `.env` file to GitHub**. It is included in `.gitignore` for security.
* **No Direct Commits to Main**: All changes must go through a branch and a PR.
* **Clear Commit Messages**: Avoid vague messages like "fix stuff".
* **Merge Conflicts**: Always pull the latest `main` before starting work to avoid conflicts.
* **VPN Notice**: If MongoDB is not connecting, try turning off your VPN.

---

## 🆘 Troubleshooting
If something breaks:
1.  Check your `.env` file for missing or incorrect values.
2.  Ensure you have the latest code from `main`.
3.  Ask for help in the Discord server.
