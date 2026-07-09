import { describe, it, expect, beforeEach } from 'vitest'
import {
  getOllamaEndpoint,
  setOllamaEndpoint,
  getOllamaModel,
  setOllamaModel
} from '../../config/ollama'

describe('ollama config', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getOllamaEndpoint', () => {
    it('returns default endpoint when nothing stored', () => {
      expect(getOllamaEndpoint()).toBe('/ollama')
    })

    it('returns stored endpoint', () => {
      localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')
      expect(getOllamaEndpoint()).toBe('http://localhost:11434')
    })
  })

  describe('setOllamaEndpoint', () => {
    it('stores endpoint to localStorage', () => {
      setOllamaEndpoint('http://custom:11434')
      expect(localStorage.getItem('versatile_ollama_endpoint')).toBe('http://custom:11434')
    })
  })

  describe('getOllamaModel', () => {
    it('returns default model when nothing stored', () => {
      expect(getOllamaModel()).toBe('dolphin-mistral:7b')
    })

    it('returns stored model', () => {
      localStorage.setItem('versatile_ollama_model', 'llama3')
      expect(getOllamaModel()).toBe('llama3')
    })
  })

  describe('setOllamaModel', () => {
    it('stores model to localStorage', () => {
      setOllamaModel('mistral')
      expect(localStorage.getItem('versatile_ollama_model')).toBe('mistral')
    })
  })
})
