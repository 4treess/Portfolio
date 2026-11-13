import { useState, useEffect, useCallback } from 'react';
import { Calendar, ArrowLeft, NotebookPen, Loader2, Trash2, Plus, Code2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

const Timeline = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editForm, setEditForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sortOrder, setSortOrder] = useState(-1);
  const [newEvent, setNewEvent] = useState({
    date: '', year: new Date().getFullYear().toString(), shortDesc: '', fullTitle: '', story: '', image: ''
  });

  // 1. PULL EVENTS FROM MONGODB
const fetchEvents = useCallback(async () => {
  setIsLoading(true);
  try {
    const response = await fetch(`https://portfolioserver-l5sd.onrender.com/api/events/${sortOrder}`);
    
    if (!response.ok) {
      const text = await response.text(); 
      console.error("SERVER ERROR HTML:", text); // Look at this in your browser console!
      return;
    }

    const data = await response.json();
    setEvents(data.filter((event) => event.type === 'project'));
  } catch (err) {
    console.error("Fetch error:", err);
  } finally {
    setIsLoading(false);
  }
}, [sortOrder]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchEvents(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [fetchEvents]);

  // 2. HELPER: CONVERT FILE TO BASE64
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

  // 3. HANDLE SUBMIT (GITHUB THEN MONGO)
  const handleAddEvent = async (e) => {
    e.preventDefault();
    try {
      let finalImagePath = newEvent.image;

      // Phase A: GitHub Upload
      if (selectedFile) {
        const base64 = await toBase64(selectedFile);
        const fileName = `project-${Date.now()}.jpg`;
        const ghResponse = await fetch(
          `https://api.github.com/repos/4treess/Portfolio/contents/public/images/${fileName}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${import.meta.env.VITE_GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `${newEvent.shortDesc}`,
              content: base64,
            }),
          }
        );
        if (!ghResponse.ok) throw new Error("GitHub Upload Failed");
        // Using the Raw URL so it works instantly without waiting for a Vercel build
        finalImagePath = `https://raw.githubusercontent.com/4treess/amie/main/public/images/${fileName}`;
        setSelectedFile(null);
      }

      // Phase B: MongoDB Save
      const mongoResponse = await fetch('https://portfolioserver-l5sd.onrender.com/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newEvent, type: 'project', image: finalImagePath }),
      });

      if (mongoResponse.ok) {
        alert("Project saved.");
        setShowForm(false);
        setNewEvent({ date: '', year: new Date().getFullYear().toString(), shortDesc: '', fullTitle: '', story: '', image: '' });
        setSelectedFile(null);
        fetchEvents(); // Refresh the list
      }
    } catch (err) {
      console.error("Error saving event:", err);
      alert("Check console for error details.");
    }
  };

    // 4. HANDLE Edit (GITHUB THEN MONGO)
  const handleEditEvent = async (e) => {
    e.preventDefault();
    try {
      let finalImagePath = selectedEvent.image;

      // Phase A: GitHub Upload
      if (selectedFile) {
        const base64 = await toBase64(selectedFile);
        const fileName = `project-${Date.now()}.jpg`;
        const ghResponse = await fetch(
          `https://api.github.com/repos/4treess/amie/contents/public/images/${fileName}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${import.meta.env.VITE_GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `${newEvent.shortDesc}`,
              content: base64,
            }),
          }
        );
        if (!ghResponse.ok) throw new Error("GitHub Upload Failed");
        // Using the Raw URL so it works instantly without waiting for a Vercel build
        finalImagePath = `https://raw.githubusercontent.com/4treess/amie/main/public/images/${fileName}`;
        setSelectedFile(null);
      }

      // Phase B: MongoDB Save
      const mongoResponse = await fetch(`https://portfolioserver-l5sd.onrender.com/api/events/${selectedEvent._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newEvent, type: 'project', image: finalImagePath }),
      });

      if (mongoResponse.ok) {
        alert("Project updated.");
        setEditForm(false);
        setSelectedEvent(null);
        setNewEvent({ date: '', year: '2026', shortDesc: '', fullTitle: '', story: '', image: '' }); 
        fetchEvents(); // Refresh the list
      }
    } catch (err) {
      console.error("Error saving event:", err);
      alert("Check console for error details.");
    }
  };

  // 5. HANDLE DELETE EVENT
  const handleDeleteEvent = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this project?");
    
    if (!confirmDelete) return; // Stop if they click cancel

    try {
      const response = await fetch(`https://portfolioserver-l5sd.onrender.com/api/events/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert("Project deleted.");
        setSelectedEvent(null); // Close the detail view panel
        fetchEvents(); // Refresh the timeline list
      } else {
        const errorData = await response.json();
        alert(`Delete failed: ${errorData.error}`);
      }
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("Could not reach the server to delete the project.");
    }
  };

  // 6. HANDLE SORT ORDER
  const handleSortOrder = async () => {
    setSortOrder((sortOrder) => sortOrder * -1);
  } 

  return (
    <div className="min-h-screen bg-[#09090b] font-sans text-slate-100">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#09090b]/90 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3 whitespace-nowrap font-semibold tracking-wide text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <Code2 size={20} />
            </span>
            Trevor De Clark
          </Link>
          <div className="flex w-full items-center justify-between gap-3 text-xs sm:w-auto sm:gap-5 sm:text-sm">
            <Link to="/" className="rounded-full bg-white/10 px-3 py-2 text-violet-200">Portfolio</Link>
            <Link to="/mines" className="text-slate-400 transition hover:text-white">Mines</Link>
            <Link to="/matching-pairs" className="text-slate-400 transition hover:text-white">Matching Pairs</Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        {!selectedEvent ? (
          <>
            <header className="py-16 sm:py-24">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-violet-300">Selected work</p>
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">Projects &amp; experience</h1>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                    A timeline of projects, experiments, and things I’ve built.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSortOrder}
                  className="self-start rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-violet-400/50 hover:text-white sm:self-auto"
                >
                  {sortOrder === 1 ? "Oldest first" : "Newest first"}
                </button>
              </div>
            </header>

            {isLoading ? (
              <div className="flex items-center gap-3 py-16 text-slate-400">
                <Loader2 className="animate-spin text-violet-300" size={22} />
                <p>Loading projects...</p>
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
                <Code2 className="mx-auto mb-4 text-violet-300" size={30} />
                <h2 className="text-xl font-semibold text-white">The timeline is ready</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Add a project to start showcasing your work here.
                </p>
              </div>
            ) : (
              <section aria-label="Project timeline" className="relative space-y-5 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-violet-400/30 sm:before:left-[19px]">
                {events.map((event) => (
                  <button
                    key={event._id}
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="group relative grid w-full grid-cols-[32px_1fr] gap-4 text-left sm:grid-cols-[40px_1fr] sm:gap-5"
                  >
                    <span className="relative z-10 mt-6 flex h-8 w-8 items-center justify-center rounded-full border border-violet-300/50 bg-[#09090b] text-violet-200 transition group-hover:bg-violet-500 sm:ml-1">
                      <span className="h-2 w-2 rounded-full bg-violet-300" />
                    </span>
                    <span className="grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition group-hover:border-violet-400/40 group-hover:bg-white/[0.07] sm:grid-cols-[180px_1fr]">
                      {event.image ? (
                        <img src={event.image} alt="" className="h-40 w-full object-cover sm:h-full" />
                      ) : (
                        <span className="flex h-32 items-center justify-center bg-gradient-to-br from-violet-500/20 to-slate-900 text-violet-200 sm:h-full">
                          <Code2 size={30} />
                        </span>
                      )}
                      <span className="flex flex-col justify-center p-5 sm:p-7">
                        <span className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
                          {event.date} {event.year}
                        </span>
                        <span className="text-xl font-semibold text-white sm:text-2xl">{event.fullTitle || event.shortDesc}</span>
                        <span className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{event.story || event.shortDesc}</span>
                        <span className="mt-5 text-sm font-semibold text-violet-200">View project <span aria-hidden="true">→</span></span>
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            )}

            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 rounded-full bg-violet-500 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:bg-violet-400"
              >
                <Plus size={18} /> Add a project
              </button>
            </div>
          </>
        ) : (
          <article className="animate-slide-up overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
            <div className="relative flex min-h-56 items-start justify-between bg-gradient-to-br from-violet-500/20 to-slate-900 p-5 sm:min-h-80 sm:p-8">
              {selectedEvent.image && <img src={selectedEvent.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
              <div className="absolute inset-0 bg-gradient-to-t from-[#101014] via-[#101014]/30 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                aria-label="Back to projects"
                className="relative z-10 rounded-full border border-white/15 bg-black/40 p-3 text-white transition hover:bg-violet-500"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="relative z-10 flex gap-2">
                <button
                  type="button"
                  aria-label="Edit project"
                  onClick={() => {
                    setNewEvent({
                      date: selectedEvent.date || '',
                      year: selectedEvent.year || '',
                      shortDesc: selectedEvent.shortDesc || '',
                      fullTitle: selectedEvent.fullTitle || '',
                      story: selectedEvent.story || '',
                      image: selectedEvent.image || ''
                    });
                    setEditForm(true);
                  }}
                  className="rounded-full border border-white/15 bg-black/40 p-3 text-white transition hover:bg-violet-500"
                >
                  <NotebookPen size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Delete project"
                  onClick={() => handleDeleteEvent(selectedEvent._id)}
                  className="rounded-full border border-white/15 bg-black/40 p-3 text-white transition hover:bg-red-500"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div className="p-6 sm:p-10">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-violet-300">
                <Calendar size={15} /> {selectedEvent.date} {selectedEvent.year}
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{selectedEvent.fullTitle || selectedEvent.shortDesc}</h2>
              <div className="prose prose-invert mt-6 max-w-none text-slate-300">
                <ReactMarkdown>{selectedEvent.story || ''}</ReactMarkdown>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="mt-8 text-sm font-semibold text-violet-200 transition hover:text-white">
                <ArrowLeft className="mr-2 inline" size={16} /> Back to all projects
              </button>
            </div>
          </article>
        )}
      </main>

      {(showForm || editForm) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={editForm ? handleEditEvent : handleAddEvent}
            className="my-auto w-full max-w-xl rounded-3xl border border-white/10 bg-[#141419] p-6 shadow-2xl sm:p-8"
          >
            <h2 className="mb-6 text-2xl font-semibold text-white">{editForm ? 'Edit project' : 'Add a project'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Date
                  <input value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} placeholder="Month or date" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm normal-case text-white outline-none focus:border-violet-400" required />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Year
                  <input value={newEvent.year} onChange={(e) => setNewEvent({ ...newEvent, year: e.target.value })} placeholder="2026" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm normal-case text-white outline-none focus:border-violet-400" required />
                </label>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Short description
                <input value={newEvent.shortDesc} onChange={(e) => setNewEvent({ ...newEvent, shortDesc: e.target.value })} placeholder="A short project summary" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm normal-case text-white outline-none focus:border-violet-400" required />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Project title
                <input value={newEvent.fullTitle} onChange={(e) => setNewEvent({ ...newEvent, fullTitle: e.target.value })} placeholder="Project name" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm normal-case text-white outline-none focus:border-violet-400" required />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Details
                <textarea value={newEvent.story} onChange={(e) => setNewEvent({ ...newEvent, story: e.target.value })} placeholder="Describe the project, tools, and what you learned..." rows="5" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 p-3 text-sm normal-case text-white outline-none focus:border-violet-400" required />
              </label>
              <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-full file:border-0 file:bg-violet-500/15 file:px-4 file:py-2 file:font-semibold file:text-violet-200 hover:file:bg-violet-500/25" />
              {selectedFile && <p className="text-xs text-slate-400">Selected image: {selectedFile.name}</p>}
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditForm(false);
                  setSelectedFile(null);
                }}
                className="rounded-full px-5 py-3 font-semibold text-slate-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-full bg-violet-500 px-6 py-3 font-semibold text-white transition hover:bg-violet-400">
                {editForm ? 'Save changes' : 'Save project'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slide-up 0.4s ease-out; }
      `}} />
    </div>
  );
};

export default Timeline;
