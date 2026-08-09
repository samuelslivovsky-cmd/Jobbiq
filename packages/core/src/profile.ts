import { z } from "zod";

export const experienceItemSchema = z.object({
  title: z.string(),
  company: z.string(),
  startDate: z.string().nullable().describe("YYYY-MM or YYYY"),
  endDate: z.string().nullable().describe("YYYY-MM, YYYY or null if current"),
  description: z.string().nullable(),
  technologies: z.array(z.string()).default([]),
});

export const educationItemSchema = z.object({
  school: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  startYear: z.string().nullable(),
  endYear: z.string().nullable(),
});

export const languageItemSchema = z.object({
  language: z.string(),
  level: z.string().nullable().describe("e.g. native, C1, B2"),
});

export const linkItemSchema = z.object({
  label: z.string().describe("e.g. LinkedIn, GitHub, Portfolio"),
  url: z.string(),
});

export const candidateProfileDataSchema = z.object({
  fullName: z.string(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  skills: z.array(z.string()).default([]),
  experience: z.array(experienceItemSchema).default([]),
  education: z.array(educationItemSchema).default([]),
  languages: z.array(languageItemSchema).default([]),
  certifications: z.array(z.string()).default([]),
  links: z.array(linkItemSchema).default([]),
});

export type CandidateProfileData = z.infer<typeof candidateProfileDataSchema>;
export type ExperienceItem = z.infer<typeof experienceItemSchema>;
export type EducationItem = z.infer<typeof educationItemSchema>;
