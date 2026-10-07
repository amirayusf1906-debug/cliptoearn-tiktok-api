const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

async function getTikTokProfile(username) {
  username = username.replace(/^@/, "").trim();

  const url =
    `https://www.tiktok.com/@${encodeURIComponent(username)}` +
    `?isUniqueId=true&isSecured=true`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`TikTok returned ${response.status}`);
  }

  const source = await response.text();

  function extract(regex) {
    const match = source.match(regex);
    return match ? match[1] : null;
  }

  const profile = {
    username: extract(/"uniqueId":"([^"]*)"/),
    nickname: extract(/"nickname":"([^"]*)"/),
    bio: extract(/"signature":"([^"]*)"/),
    followers: Number(extract(/"followerCount":(\d+)/) || 0),
    following: Number(extract(/"followingCount":(\d+)/) || 0),
    likes: Number(extract(/"heartCount":(\d+)/) || 0),
    videos: Number(extract(/"videoCount":(\d+)/) || 0),
    verified: extract(/"verified":(true|false)/) === "true",
    privateAccount:
      extract(/"privateAccount":(true|false)/) === "true"
  };

  if (!profile.username) {
    throw new Error("TikTok profile could not be found");
  }

  profile.profileUrl = `https://www.tiktok.com/@${profile.username}`;

  return profile;
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "ClipToEarn TikTok API"
  });
});

app.get("/tiktok/:username", async (req, res) => {
  try {
    const profile = await getTikTokProfile(req.params.username);
    res.json(profile);
  } catch (error) {
    res.status(502).json({
      error: "TikTok profile lookup failed",
      message: error.message
    });
  }
});

app.get("/tiktok/verify/:username/:code", async (req, res) => {
  try {
    const profile = await getTikTokProfile(req.params.username);

    const code = req.params.code.trim().toUpperCase();
    const bio = (profile.bio || "").toUpperCase();

    res.json({
      verified: bio.includes(code),
      ...profile
    });
  } catch (error) {
    res.status(502).json({
      error: "TikTok verification failed",
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ClipToEarn TikTok API running on port ${PORT}`);
});
