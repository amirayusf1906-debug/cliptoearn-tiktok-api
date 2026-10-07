const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

function cleanUsername(username) {
  return username.replace(/^@/, "").trim();
}

function extract(source, regex) {
  const match = source.match(regex);
  return match ? match[1] : null;
}

async function fetchTikTokPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`TikTok returned ${response.status}`);
  }

  return response.text();
}

/* =========================
   TIKTOK PROFILE
========================= */

async function getTikTokProfile(username) {
  username = cleanUsername(username);

  const url =
    `https://www.tiktok.com/@${encodeURIComponent(username)}` +
    `?isUniqueId=true&isSecured=true`;

  const source = await fetchTikTokPage(url);

  const profile = {
    username: extract(source, /"uniqueId":"([^"]*)"/),
    nickname: extract(source, /"nickname":"([^"]*)"/),
    bio: extract(source, /"signature":"([^"]*)"/),

    followers: Number(
      extract(source, /"followerCount":(\d+)/) || 0
    ),

    following: Number(
      extract(source, /"followingCount":(\d+)/) || 0
    ),

    likes: Number(
      extract(source, /"heartCount":(\d+)/) || 0
    ),

    videos: Number(
      extract(source, /"videoCount":(\d+)/) || 0
    ),

    verified:
      extract(source, /"verified":(true|false)/) === "true",

    privateAccount:
      extract(source, /"privateAccount":(true|false)/) === "true"
  };

  if (!profile.username) {
    throw new Error("TikTok profile could not be found");
  }

  profile.profileUrl =
    `https://www.tiktok.com/@${profile.username}`;

  return profile;
}

/* =========================
   TIKTOK VIDEO
========================= */

async function getTikTokVideo(videoId) {
  videoId = videoId.trim();

  const url =
    `https://www.tiktok.com/@_/video/${encodeURIComponent(videoId)}`;

  const source = await fetchTikTokPage(url);

  const video = {
    id: videoId,

    description:
      extract(source, /"desc":"([^"]*)"/) || "",

    author:
      extract(source, /"uniqueId":"([^"]*)"/) || "",

    nickname:
      extract(source, /"nickname":"([^"]*)"/) || "",

    views: Number(
      extract(source, /"playCount":(\d+)/) || 0
    ),

    likes: Number(
      extract(source, /"diggCount":(\d+)/) || 0
    ),

    comments: Number(
      extract(source, /"commentCount":(\d+)/) || 0
    ),

    shares: Number(
      extract(source, /"shareCount":(\d+)/) || 0
    )
  };

  video.videoUrl =
    `https://www.tiktok.com/@_/video/${videoId}`;

  return video;
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "ClipToEarn TikTok API",
    version: "1.0.0"
  });
});

/* =========================
   PROFILE ENDPOINT
========================= */

app.get("/tiktok/:username", async (req, res) => {
  try {
    const profile = await getTikTokProfile(
      req.params.username
    );

    res.json(profile);
  } catch (error) {
    res.status(502).json({
      error: "TikTok profile lookup failed",
      message: error.message
    });
  }
});

/* =========================
   BIO VERIFICATION
========================= */

app.get(
  "/tiktok/verify/:username/:code",
  async (req, res) => {
    try {
      const profile = await getTikTokProfile(
        req.params.username
      );

      const code =
        req.params.code.trim().toUpperCase();

      const bio =
        (profile.bio || "").toUpperCase();

      res.json({
        verified: bio.includes(code),
        verificationCode: code,
        ...profile
      });
    } catch (error) {
      res.status(502).json({
        error: "TikTok verification failed",
        message: error.message
      });
    }
  }
);

/* =========================
   VIDEO ENDPOINT
========================= */

app.get("/tiktok/video/:videoId", async (req, res) => {
  try {
    const video = await getTikTokVideo(
      req.params.videoId
    );

    res.json(video);
  } catch (error) {
    res.status(502).json({
      error: "TikTok video lookup failed",
      message: error.message
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `ClipToEarn TikTok API running on port ${PORT}`
  );
});
