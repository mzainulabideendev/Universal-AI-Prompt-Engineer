using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace UniversalAIPromptEngineer.VisualStudio
{
    internal sealed class ProviderSettings
    {
        public string Endpoint { get; set; }
        public string Model { get; set; }

        public static ProviderSettings CreateDefault()
        {
            return new ProviderSettings
            {
                Endpoint = "https://api.openai.com/v1",
                Model = "gpt-4o-mini"
            };
        }
    }

    internal static class ProviderSettingsStore
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("UniversalAIPromptEngineer");
        private static readonly string SettingsDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "UniversalAIPromptEngineer");

        private static string SettingsPath
        {
            get { return Path.Combine(SettingsDirectory, "provider-settings.json"); }
        }

        private static string KeyPath
        {
            get { return Path.Combine(SettingsDirectory, "provider-key.dat"); }
        }

        public static ProviderSettings LoadSettings()
        {
            if (!File.Exists(SettingsPath))
            {
                return ProviderSettings.CreateDefault();
            }

            var serializer = new JavaScriptSerializer();
            var settings = serializer.Deserialize<ProviderSettings>(File.ReadAllText(SettingsPath));
            if (settings == null || String.IsNullOrWhiteSpace(settings.Endpoint) || String.IsNullOrWhiteSpace(settings.Model))
            {
                throw new InvalidDataException("Saved provider settings are invalid. Review the endpoint and model fields.");
            }
            return settings;
        }

        public static void SaveSettings(ProviderSettings settings)
        {
            Directory.CreateDirectory(SettingsDirectory);
            var serializer = new JavaScriptSerializer();
            File.WriteAllText(SettingsPath, serializer.Serialize(settings), Encoding.UTF8);
        }

        public static string LoadApiKey()
        {
            if (!File.Exists(KeyPath))
            {
                return String.Empty;
            }

            var encrypted = File.ReadAllBytes(KeyPath);
            var clearText = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(clearText);
        }

        public static void SaveApiKey(string apiKey)
        {
            Directory.CreateDirectory(SettingsDirectory);
            var clearText = Encoding.UTF8.GetBytes(apiKey);
            var encrypted = ProtectedData.Protect(clearText, Entropy, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(KeyPath, encrypted);
        }

        public static void ClearApiKey()
        {
            if (File.Exists(KeyPath))
            {
                File.Delete(KeyPath);
            }
        }
    }
}
