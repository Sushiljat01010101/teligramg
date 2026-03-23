# How to Host on Render.com

Your application is 100% ready to be deployed to Render! It has a valid `package.json` with a start script, properly set up `.gitignore`, and a Supabase database which ensures data persists across server restarts.

Follow these simple steps to make your app live on the internet:

## Step 1: Upload Your Code to GitHub
Render pulls code directly from your GitHub repository.
1. Create a free account on [GitHub](https://github.com/).
2. Create a **New Repository** (make it Private or Public, up to you).
3. Do not initialize with a README or .gitignore (we already have one).
4. Upload all your files from the `teligram galery` folder into this repository. (Make sure `.env` and `node_modules` are NOT uploaded - our `.gitignore` handles this automatically if you use Git).

## Step 2: Connect to Render.com
1. Go to [Render.com](https://render.com/) and sign up using your GitHub account.
2. Click on the **New +** button at the top and select **Web Service**.
3. Connect your GitHub account and select the repository you just created.

## Step 3: Configure Render Settings
Fill out the configuration form with these exact details:
- **Name**: Choose any name for your app (e.g., `telegram-gallery-app`)
- **Region**: Choose the one closest to you (e.g., Singapore or Frankfurt)
- **Branch**: `main` or `master`
- **Root Directory**: Leave it blank
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: Select the **Free** tier.

## Step 4: Add Environment Variables
Scroll down to the **Environment Variables** section. Render needs to know your secret keys since they are not in the GitHub code.
Add the following keys exactly as they are in your local `.env` file:
1. `SUPABASE_URL` = Your Supabase Project URL
2. `SUPABASE_KEY` = Your Supabase anon public key
3. `JWT_SECRET` = Generate a random secure password for user authentication (e.g. `my_super_secure_secret_12345`)

*(Note: You **do NOT** need to add `BOT_TOKEN` or `CHAT_ID` here, because the app now takes these directly from the user's Profile Configuration screen when they log in!)*

## Step 5: Deploy!
Click the **Create Web Service** button at the bottom.
Render will now download your code, run `npm install`, and start your Node.js server. In about 2-3 minutes, you will get a live `.onrender.com` link. 

Visit that link, register a new account, configure your bot token in the Profile modal, and start sending photos!
