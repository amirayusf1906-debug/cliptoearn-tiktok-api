const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =========================
   HELPERS
========================= */

function cleanUsername(username) {
  return String(username || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function cleanVideoId(videoId) {
  return String(videoId || "").trim();
}

async function fetchTikTokPage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",

      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

      "Accept-Language":
        "en-US,en;q=0.9",

      Referer:
        "https://www.tiktok.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`TikTok returned ${response.status}`);
  }

  return response.text();
}

function getUniversalData(html) {
  const match = html.match(
    /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function walkObject(value, callback, seen = new Set()) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  const result = callback(value);

  if (result) {
    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkObject(item, callback, seen);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const key of Object.keys(value)) {
    const found = walkObject(
      value[key],
      callback,
      seen
    );

    if (found) {
      return found;
    }
  }

  return null;
}

function extractRegex(source, regex) {
  const match = source.match(regex);

  return match ? match[1] : null;
}

/* =========================
   TIKTOK PROFILE
========================= */

async function getTikTokProfile(username) {
  username = cleanUsername(username);

  if (!username) {
    throw new Error("Invalid TikTok username");
  }

  const url =
    `https://www.tiktok.com/@${encodeURIComponent(username)}` +
    `?isUniqueId=true&isSecured=true`;

  const source = await fetchTikTokPage(url);

  const universalData =
    getUniversalData(source);

  let user = null;

  /*
   * Look through TikTok's embedded data for
   * the actual profile object.
   */
  if (universalData) {
    user = walkObject(
      universalData,
      (obj) => {
        if (
          typeof obj.uniqueId === "string" &&
          (
            typeof obj.signature === "string" ||
            obj.stats
          )
        ) {
          return obj;
        }

        return null;
      }
    );
  }

  /*
   * Fallback for older TikTok page formats.
   */
  if (!user) {
    const uniqueId =
      extractRegex(
        source,
        /"uniqueId"\s*:\s*"([^"]+)"/
      );

    const nickname =
      extractRegex(
        source,
        /"nickname"\s*:\s*"([^"]*)"/
      );

    const signature =
      extractRegex(
        source,
        /"signature"\s*:\s*"([^"]*)"/
      );

    if (uniqueId) {
      user = {
        uniqueId,
        nickname,
        signature
      };
    }
  }

  if (!user || !user.uniqueId) {
    throw new Error(
      "TikTok profile could not be found"
    );
  }

  const returnedUsername =
    cleanUsername(user.uniqueId);

  /*
   * Prevent accidentally returning another
   * profile if TikTok gives us unexpected data.
   */
  if (returnedUsername !== username) {
    throw new Error(
      "TikTok username mismatch"
    );
  }

  const stats =
    user.stats ||
    user.statistics ||
    {};

  const followers =
    Number(
      stats.followerCount ??
      stats.followers ??
      0
    );

  const following =
    Number(
      stats.followingCount ??
      stats.following ??
      0
    );

  const likes =
    Number(
      stats.heartCount ??
      stats.heart ??
      0
    );

  const videos =
    Number(
      stats.videoCount ??
      stats.videos ??
      0
    );

  const verified =
    user.verified === true;

  const privateAccount =
    user.privateAccount === true;

  const profile = {
    username: returnedUsername,

    nickname:
      typeof user.nickname === "string"
        ? user.nickname
        : "",

    bio:
      typeof user.signature === "string"
        ? user.signature
        : "",

    followers:
      Number.isFinite(followers)
        ? Math.floor(followers)
        : 0,

    following:
      Number.isFinite(following)
        ? Math.floor(following)
        : 0,

    likes:
      Number.isFinite(likes)
        ? Math.floor(likes)
        : 0,

    videos:
      Number.isFinite(videos)
        ? Math.floor(videos)
        : 0,

    verified,

    privateAccount
  };

  profile.profileUrl =
    `https://www.tiktok.com/@${profile.username}`;

  return profile;
}

/* =========================
   TIKTOK VIDEO
========================= */

async function getTikTokVideo(videoId) {
  videoId = cleanVideoId(videoId);

  if (!/^\d+$/.test(videoId)) {
    throw new Error("Invalid TikTok video ID");
  }

  const url =
    `https://www.tiktok.com/@_/video/${encodeURIComponent(videoId)}`;

  const source = await fetchTikTokPage(url);

  const universalData =
    getUniversalData(source);

  let video = null;

  /*
   * Search TikTok embedded data for the
   * requested video.
   */
  if (universalData) {
    video = walkObject(
      universalData,
      (obj) => {
        if (
          String(obj.id || "") === videoId &&
          (
            obj.stats ||
            obj.statistics ||
            obj.video
          )
        ) {
          return obj;
        }

        return null;
      }
    );
  }

  /*
   * Fallback for older TikTok HTML.
   */
  if (!video) {
    video = {
      id: videoId,

      desc:
        extractRegex(
          source,
          /"desc"\s*:\s*"([^"]*)"/
        ),

      stats: {
        playCount: Number(
          extractRegex(
            source,
            /"playCount"\s*:\s*(\d+)/
          ) || 0
        ),

        diggCount: Number(
          extractRegex(
            source,
            /"diggCount"\s*:\s*(\d+)/
          ) || 0
        ),

        commentCount: Number(
          extractRegex(
            source,
            /"commentCount"\s*:\s*(\d+)/
          ) || 0
        ),

        shareCount: Number(
          extractRegex(
            source,
            /"shareCount"\s*:\s*(\d+)/
          ) || 0
        )
      }
    };
  }

  if (!video) {
    throw new Error(
      "TikTok video could not be found"
    );
  }

  const author =
    video.author ||
    video.user ||
    {};

  const stats =
    video.stats ||
    video.statistics ||
    {};

  const username =
    typeof author.uniqueId === "string"
      ? cleanUsername(author.uniqueId)
      : "";

  const nickname =
    typeof author.nickname === "string"
      ? author.nickname
      : "";

  const views =
    Number(
      stats.playCount ??
      stats.play_count ??
      0
    );

  const likes =
    Number(
      stats.diggCount ??
      stats.digg_count ??
      0
    );

  const comments =
    Number(
      stats.commentCount ??
      stats.comment_count ??
      0
    );

  const shares =
    Number(
      stats.shareCount ??
      stats.share_count ??
      0
    );

  const description =
    typeof video.desc === "string"
      ? video.desc
      : typeof video.description === "string"
        ? video.description
        : "";

  return {
    id: videoId,

    description,

    author: username,

    nickname,

    views:
      Number.isFinite(views)
        ? Math.floor(views)
        : 0,

    likes:
      Number.isFinite(likes)
        ? Math.floor(likes)
        : 0,

    comments:
      Number.isFinite(comments)
        ? Math.floor(comments)
        : 0,

    shares:
      Number.isFinite(shares)
        ? Math.floor(shares)
        : 0,

    videoUrl:
      username
        ? `https://www.tiktok.com/@${username}/video/${videoId}`
        : `https://www.tiktok.com/video/${videoId}`
  };
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "ClipToEarn TikTok API",
    version: "2.0.0"
  });
});

/* =========================
   PROFILE
========================= */

app.get("/tiktok/:username", async (req, res) => {
  try {
    const profile =
      await getTikTokProfile(
        req.params.username
      );

    res.json(profile);
  } catch (error) {
    console.error(
      "TikTok profile error:",
      error.message
    );

    if (
      /could not be found/i.test(
        error.message
      )
    ) {
      return res.status(404).json({
        error: "not_found",
        message:
          "TikTok profile could not be found"
      });
    }

    res.status(502).json({
      error: "provider_error",
      message:
        "TikTok profile lookup failed"
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
      const username =
        cleanUsername(
          req.params.username
        );

      const code =
        decodeURIComponent(
          req.params.code || ""
        )
          .trim()
          .toUpperCase();

      const profile =
        await getTikTokProfile(
          username
        );

      const bio =
        String(profile.bio || "")
          .toUpperCase();

      const verified =
        bio.includes(code);

      res.json({
        verified,

        verificationCode: code,

        username:
          profile.username,

        nickname:
          profile.nickname,

        bio:
          profile.bio,

        followers:
          profile.followers,

        following:
          profile.following,

        likes:
          profile.likes,

        videos:
          profile.videos,

        privateAccount:
          profile.privateAccount,

        profileUrl:
          profile.profileUrl
      });
    } catch (error) {
      console.error(
        "TikTok verification error:",
        error.message
      );

      if (
        /could not be found/i.test(
          error.message
        )
      ) {
        return res.status(404).json({
          error: "not_found",
          message:
            "TikTok profile could not be found"
        });
      }

      res.status(502).json({
        error: "provider_error",
        message:
          "TikTok verification temporarily unavailable"
      });
    }
  }
);

/* =========================
   VIDEO
========================= */

app.get(
  "/tiktok/video/:videoId",
  async (req, res) => {
    try {
      const video =
        await getTikTokVideo(
          req.params.videoId
        );

      res.json(video);
    } catch (error) {
      console.error(
        "TikTok video error:",
        error.message
      );

      if (
        /could not be found/i.test(
          error.message
        )
      ) {
        return res.status(404).json({
          error: "not_found",
          message:
            "TikTok video could not be found"
        });
      }

      res.status(502).json({
        error: "provider_error",
        message:
          "TikTok video lookup failed"
      });
    }
  }
);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(
    `ClipToEarn TikTok API running on port ${PORT}`
  );
});
