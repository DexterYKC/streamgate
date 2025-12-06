const params = new URLSearchParams(window.location.search);
const cid = params.get("cid");
const title = params.get("title");

document.getElementById("title").textContent = title;

const videoUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

const video = document.getElementById("video");
video.src = videoUrl;
