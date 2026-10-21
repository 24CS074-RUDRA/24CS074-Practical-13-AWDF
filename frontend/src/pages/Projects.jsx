import React, { useState, useEffect } from 'react';

function Projects() {
  const [projects, setProjects] = useState([
    {
      id: 1,
      name: 'Task Manager Backend API',
      description: 'Node.js, Express & MongoDB REST service with JWT authentication and Mongoose validation pipeline.',
      status: 'Active',
      tasksCount: 12,
      completedCount: 9,
    },
    {
      id: 2,
      name: 'Frontend Performance Optimization',
      description: 'React route-based code splitting using React.lazy(), Suspense boundaries, and Vite build chunking.',
      status: 'In Progress',
      tasksCount: 5,
      completedCount: 3,
    },
    {
      id: 3,
      name: 'User Management Subsystem',
      description: 'Password hashing with bcryptjs and secure token generation for multi-tenant task assignment.',
      status: 'Planning',
      tasksCount: 8,
      completedCount: 0,
    }
  ]);

  return (
    <div className="projects-container">
      <div className="page-header">
        <h1>Projects Dashboard</h1>
        <p>A snapshot of the work and milestones in motion.</p>
      </div>

      <div className="grid">
        {projects.map((proj) => (
          <div key={proj.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>{proj.name}</h2>
              <span className={`badge ${proj.status === 'Active' ? 'badge-completed' : proj.status === 'In Progress' ? 'badge-in-progress' : 'badge-pending'}`}>
                {proj.status}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              {proj.description}
            </p>
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <span>Total Tasks: {proj.tasksCount}</span>
              <span>Completed: {proj.completedCount}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// React.lazy() requires a default export from the dynamically imported module
export default Projects;
