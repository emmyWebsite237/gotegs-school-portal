// ==========================================================================
// Homepage Updates — post/delete (admin) + display (public homepage)
// Requires: supabase-config.js loaded first, and the Supabase JS CDN script.
// ==========================================================================

const UPDATES_BUCKET = "update-images";

// -------- ADMIN: create a new post --------

async function postUpdate({ file, message }) {
  let imageUrl = null;

  if (file) {
    const filePath = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabaseClient
      .storage
      .from(UPDATES_BUCKET)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseClient
      .storage
      .from(UPDATES_BUCKET)
      .getPublicUrl(filePath);

    imageUrl = publicUrlData.publicUrl;
  }

  const { error: insertError } = await supabaseClient
    .from("updates")
    .insert({ message, image_url: imageUrl });
    // visible_at defaults to now() + 30 seconds automatically (set in the DB schema)

  if (insertError) throw insertError;
}

// -------- ADMIN: fetch ALL updates (including not-yet-visible ones) for management --------

async function fetchAllUpdatesForAdmin() {
  const { data, error } = await supabaseClient
    .from("updates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// -------- ADMIN: delete a post --------

async function deleteUpdate(id) {
  const { error } = await supabaseClient
    .from("updates")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// -------- PUBLIC: fetch only updates that are visible (30 sec have passed) --------

async function fetchVisibleUpdates() {
  const { data, error } = await supabaseClient
    .from("updates")
    .select("*")
    .lte("visible_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// -------- PUBLIC: render updates into the homepage feed --------

function renderUpdateCard(update) {
  const date = new Date(update.created_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return `
    <article class="update-card">
      ${update.image_url ? `<img src="${update.image_url}" alt="" />` : ""}
      <div class="update-card-body">
        <div class="update-card-date">${date}</div>
        <p class="update-card-message">${update.message}</p>
      </div>
    </article>
  `;
}

async function loadHomepageFeed() {
  const feed = document.getElementById("updates-feed");
  if (!feed) return;

  try {
    const updates = await fetchVisibleUpdates();

    if (!updates.length) {
      feed.innerHTML = `<div class="empty-state">No updates posted yet. Check back soon.</div>`;
      return;
    }

    feed.innerHTML = updates.map(renderUpdateCard).join("");
  } catch (err) {
    console.error("Failed to load updates:", err);
    feed.innerHTML = `<div class="empty-state">Could not load updates right now.</div>`;
  }
}

// Auto-run on the homepage
document.addEventListener("DOMContentLoaded", loadHomepageFeed);
