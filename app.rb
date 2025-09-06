require 'sinatra/base'
require 'json'
require 'fileutils'

class App < Sinatra::Base
  # Configuration
  configure do
    set :port, 4567
    set :bind, '0.0.0.0'
    set :public_folder, File.dirname(__FILE__) + '/public'
    set :static, true

    # Créer le dossier cassettes s'il n'existe pas
    cassettes_dir = File.join(__dir__, 'public', 'cassettes')
    FileUtils.mkdir_p(cassettes_dir) unless Dir.exist?(cassettes_dir)
  end

  # CORS pour permettre les requêtes depuis le frontend
  before do
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
  end

  # Gérer les requêtes OPTIONS (preflight CORS)
  options '*' do
    200
  end

  # Route pour servir le fichier HTML principal
  get '/' do
    send_file File.join(settings.public_folder, 'index.html')
  end

  # API pour lister les cassettes disponibles
  get '/api/cassettes' do
    content_type :json

    cassettes = []
    cassettes_dir = File.join(settings.public_folder, 'cassettes')
    Dir.glob(File.join(cassettes_dir, '*.json')).each do |file|
      name = File.basename(file, '.json')
      cassettes << {
        name:,
        file: "cassettes/#{name}.json",
        created_at: File.mtime(file).iso8601
      }
    end

    cassettes.to_json
  end

  # API pour sauvegarder une nouvelle cassette
  post '/api/cassettes' do
    content_type :json

    begin
      data = JSON.parse(request.body.read)
      name = data['name']
      midi_data = data['data']

      # Validation
      if name.nil? || name.empty?
        status 400
        return { error: 'Le nom de la cassette est requis' }.to_json
      end

      if midi_data.nil? || !midi_data.is_a?(Array)
        status 400
        return { error: 'Les données MIDI sont requises et doivent être un tableau' }.to_json
      end

      # Nettoyer le nom pour éviter les problèmes de fichier
      clean_name = name.gsub(/[^a-zA-Z0-9_-]/, '_')
      filename = "#{clean_name}.json"
      cassettes_dir = File.join(settings.public_folder, 'cassettes')
      filepath = File.join(cassettes_dir, filename)

      # Créer l'objet cassette
      cassette = {
        name:,
        created_at: Time.now.iso8601,
        data: midi_data
      }

      # Sauvegarder le fichier
      File.write(filepath, JSON.pretty_generate(cassette))

      {
        success: true,
        message: 'Cassette sauvegardée avec succès',
        file: "cassettes/#{filename}"
      }.to_json
    rescue JSON::ParserError
      status 400
      { error: 'Format JSON invalide' }.to_json
    rescue StandardError => e
      status 500
      { error: "Erreur serveur: #{e.message}" }.to_json
    end
  end

  # Route catch-all pour servir les fichiers statiques
  get '*' do
    file_path = File.join(settings.public_folder, request.path_info)
    if File.exist?(file_path) && File.file?(file_path)
      send_file file_path
    else
      status 404
      'Fichier non trouvé'
    end
  end

  # Démarrer l'application si ce fichier est exécuté directement
  run! if app_file == $0
end
