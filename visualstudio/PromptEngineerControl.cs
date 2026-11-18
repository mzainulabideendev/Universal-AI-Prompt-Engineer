using System;
using System.Collections;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace UniversalAIPromptEngineer.VisualStudio
{
    internal sealed class PromptEngineerControl : UserControl
    {
        private static readonly HttpClient HttpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(90) };
        private readonly TextBox _endpoint = new TextBox();
        private readonly TextBox _model = new TextBox();
        private readonly PasswordBox _apiKey = new PasswordBox();
        private readonly ComboBox _mode = new ComboBox();
        private readonly TextBox _prompt = new TextBox();
        private readonly TextBox _result = new TextBox();
        private readonly TextBlock _status = new TextBlock();
        private readonly Button _enhanceButton = new Button();

        public PromptEngineerControl()
        {
            var settings = ProviderSettingsStore.LoadSettings();
            _endpoint.Text = settings.Endpoint;
            _model.Text = settings.Model;
            Content = CreateLayout();
            UpdateKeyStatus();
        }

        private UIElement CreateLayout()
        {
            var content = new StackPanel { Margin = new Thickness(14) };
            content.Children.Add(new TextBlock
            {
                Text = "AI provider settings",
                FontSize = 17,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 10)
            });

            AddField(content, "HTTPS API endpoint", _endpoint);
            AddField(content, "Model", _model);
            AddField(content, "API key (saved encrypted for your Windows user)", _apiKey);

            var settingsButtons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 8) };
            settingsButtons.Children.Add(CreateButton("Save settings", SaveSettings));
            settingsButtons.Children.Add(CreateButton("Remove saved key", RemoveApiKey));
            content.Children.Add(settingsButtons);
            content.Children.Add(_status);

            content.Children.Add(new TextBlock
            {
                Text = "Mode",
                Margin = new Thickness(0, 14, 0, 4)
            });
            _mode.Items.Add(new ModeOption("Quick Enhance", "quick"));
            _mode.Items.Add(new ModeOption("Professional Enhance", "professional"));
            _mode.Items.Add(new ModeOption("Developer Mode", "developer"));
            _mode.Items.Add(new ModeOption("Expert Architect", "architect"));
            _mode.Items.Add(new ModeOption("Debugging Mode", "debugging"));
            _mode.Items.Add(new ModeOption("Code Review Mode", "code-review"));
            _mode.Items.Add(new ModeOption("UI/UX Mode", "uiux"));
            _mode.Items.Add(new ModeOption("Game Development Mode", "game"));
            _mode.Items.Add(new ModeOption("Autonomous Agent Mode", "autonomous"));
            _mode.SelectedIndex = 1;
            content.Children.Add(_mode);

            content.Children.Add(new TextBlock { Text = "Prompt", Margin = new Thickness(0, 12, 0, 4) });
            _prompt.AcceptsReturn = true;
            _prompt.TextWrapping = TextWrapping.Wrap;
            _prompt.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            _prompt.MinHeight = 120;
            content.Children.Add(_prompt);

            _enhanceButton.Content = "Enhance with AI";
            _enhanceButton.Margin = new Thickness(0, 8, 0, 8);
            _enhanceButton.HorizontalAlignment = HorizontalAlignment.Left;
            _enhanceButton.Click += EnhanceButton_Click;
            content.Children.Add(_enhanceButton);

            content.Children.Add(new TextBlock { Text = "Enhanced prompt", Margin = new Thickness(0, 4, 0, 4) });
            _result.AcceptsReturn = true;
            _result.TextWrapping = TextWrapping.Wrap;
            _result.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            _result.MinHeight = 180;
            _result.IsReadOnly = true;
            content.Children.Add(_result);
            var copyButton = CreateButton("Copy result", CopyResult);
            copyButton.HorizontalAlignment = HorizontalAlignment.Left;
            content.Children.Add(copyButton);

            var scrollViewer = new ScrollViewer
            {
                Content = content,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
            return scrollViewer;
        }

        private static void AddField(Panel panel, string label, Control control)
        {
            panel.Children.Add(new TextBlock { Text = label, Margin = new Thickness(0, 5, 0, 3) });
            control.Margin = new Thickness(0, 0, 0, 5);
            panel.Children.Add(control);
        }

        private static Button CreateButton(string label, RoutedEventHandler handler)
        {
            var button = new Button
            {
                Content = label,
                Padding = new Thickness(10, 5, 10, 5),
                Margin = new Thickness(0, 0, 8, 0)
            };
            button.Click += handler;
            return button;
        }

        private void SaveSettings(object sender, RoutedEventArgs args)
        {
            try
            {
                SaveProviderSettings();
                _status.Text = "Provider settings saved. " + (String.IsNullOrEmpty(ProviderSettingsStore.LoadApiKey())
                    ? "Enter an API key to enable enhancement."
                    : "API key is saved encrypted for your Windows user.");
            }
            catch (Exception exception)
            {
                _status.Text = "Could not save settings: " + exception.Message;
            }
        }

        private void RemoveApiKey(object sender, RoutedEventArgs args)
        {
            var result = MessageBox.Show(
                "Remove the saved provider API key?",
                "Universal AI Prompt Engineer",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            if (result != MessageBoxResult.Yes)
            {
                return;
            }

            try
            {
                ProviderSettingsStore.ClearApiKey();
                _status.Text = "Saved API key removed.";
            }
            catch (Exception exception)
            {
                _status.Text = "Could not remove the API key: " + exception.Message;
            }
        }

        private async void EnhanceButton_Click(object sender, RoutedEventArgs args)
        {
            await EnhancePromptAsync();
        }

        private async Task EnhancePromptAsync()
        {
            try
            {
                SaveProviderSettings();
                var apiKey = ProviderSettingsStore.LoadApiKey();
                if (String.IsNullOrWhiteSpace(apiKey))
                {
                    throw new InvalidOperationException("Enter an API key in AI provider settings before enhancing a prompt.");
                }
                if (String.IsNullOrWhiteSpace(_prompt.Text))
                {
                    throw new InvalidOperationException("Enter a prompt before enhancing it.");
                }
                if (_prompt.Text.Length > 20000)
                {
                    throw new InvalidOperationException("The prompt is too long. Keep it under 20,000 characters.");
                }

                var settings = ProviderSettingsStore.LoadSettings();
                var mode = _mode.SelectedItem as ModeOption;
                _enhanceButton.IsEnabled = false;
                _status.Text = "Enhancing with AI…";
                _result.Clear();
                _result.Text = await RequestCompletionAsync(settings, apiKey, mode == null ? "professional" : mode.Value, _prompt.Text);
                _status.Text = "Prompt enhanced. Review the result before using it.";
            }
            catch (Exception exception)
            {
                _status.Text = "Enhancement failed: " + exception.Message;
            }
            finally
            {
                _enhanceButton.IsEnabled = true;
            }
        }

        private void SaveProviderSettings()
        {
            BuildCompletionUrl(_endpoint.Text);
            var settings = new ProviderSettings
            {
                Endpoint = _endpoint.Text.Trim(),
                Model = _model.Text.Trim()
            };
            if (String.IsNullOrWhiteSpace(settings.Model) || settings.Model.Length > 200)
            {
                throw new InvalidOperationException("Enter a model name between 1 and 200 characters.");
            }

            ProviderSettingsStore.SaveSettings(settings);
            if (!String.IsNullOrWhiteSpace(_apiKey.Password))
            {
                ProviderSettingsStore.SaveApiKey(_apiKey.Password.Trim());
                _apiKey.Clear();
            }
            _endpoint.Text = settings.Endpoint;
            _model.Text = settings.Model;
        }

        private void UpdateKeyStatus()
        {
            try
            {
                _status.Text = String.IsNullOrEmpty(ProviderSettingsStore.LoadApiKey())
                    ? "No API key saved. Configure one to use AI enhancement."
                    : "API key saved encrypted for your Windows user.";
            }
            catch (Exception exception)
            {
                _status.Text = "Could not read the saved API key: " + exception.Message;
            }
        }

        private static void CopyResult(object sender, RoutedEventArgs args)
        {
            var control = sender as Button;
            var owner = control == null ? null : control.Parent as Panel;
            var text = FindResultTextBox(owner);
            if (text == null || String.IsNullOrWhiteSpace(text.Text))
            {
                MessageBox.Show("There is no enhanced prompt to copy.", "Universal AI Prompt Engineer");
                return;
            }

            Clipboard.SetText(text.Text);
        }

        private static TextBox FindResultTextBox(DependencyObject parent)
        {
            if (parent == null)
            {
                return null;
            }

            var panel = parent as Panel;
            if (panel != null)
            {
                foreach (UIElement child in panel.Children)
                {
                    var textBox = child as TextBox;
                    if (textBox != null && textBox.IsReadOnly)
                    {
                        return textBox;
                    }
                    var nested = FindResultTextBox(child);
                    if (nested != null)
                    {
                        return nested;
                    }
                }
            }
            return null;
        }

        private static async Task<string> RequestCompletionAsync(ProviderSettings settings, string apiKey, string mode, string prompt)
        {
            var url = BuildCompletionUrl(settings.Endpoint);
            var body = new
            {
                model = settings.Model,
                temperature = 0.4,
                messages = new[]
                {
                    new { role = "system", content = BuildSystemPrompt(mode) },
                    new { role = "user", content = prompt.Trim() }
                }
            };

            var serializer = new System.Web.Script.Serialization.JavaScriptSerializer();
            using (var request = new HttpRequestMessage(HttpMethod.Post, url))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                request.Content = new StringContent(serializer.Serialize(body), Encoding.UTF8, "application/json");
                using (var response = await HttpClient.SendAsync(request))
                {
                    var responseBody = await response.Content.ReadAsStringAsync();
                    var payload = serializer.Deserialize<Dictionary<string, object>>(responseBody);
                    if (!response.IsSuccessStatusCode)
                    {
                        var providerMessage = ReadProviderError(payload);
                        throw new InvalidOperationException(
                            "AI provider request failed (HTTP " + (int)response.StatusCode + ")" +
                            (String.IsNullOrEmpty(providerMessage) ? "." : ": " + providerMessage));
                    }

                    var completion = ReadCompletion(payload);
                    if (String.IsNullOrWhiteSpace(completion))
                    {
                        throw new InvalidOperationException("The AI provider returned an empty response. Check the model and try again.");
                    }
                    return completion;
                }
            }
        }

        private static string BuildCompletionUrl(string endpoint)
        {
            Uri uri;
            if (!Uri.TryCreate(endpoint, UriKind.Absolute, out uri) ||
                uri.Scheme != Uri.UriSchemeHttps ||
                !String.IsNullOrEmpty(uri.UserInfo) ||
                !String.IsNullOrEmpty(uri.Query) ||
                !String.IsNullOrEmpty(uri.Fragment))
            {
                throw new InvalidOperationException("The API endpoint must be an HTTPS URL without credentials, a query, or a fragment.");
            }

            var path = uri.AbsolutePath.TrimEnd('/');
            if (!path.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase))
            {
                path += "/chat/completions";
            }
            var builder = new UriBuilder(uri) { Path = path };
            return builder.Uri.ToString();
        }

        private static string BuildSystemPrompt(string mode)
        {
            var modeInstruction = "Produce a polished, well-structured prompt with appropriate context, scope, deliverables, and success criteria.";
            switch (mode)
            {
                case "quick": modeInstruction = "Clarify the request concisely without unnecessary expansion."; break;
                case "developer": modeInstruction = "Emphasize implementation details, project conventions, error handling, security where relevant, and focused tests."; break;
                case "architect": modeInstruction = "Emphasize requirements, architecture, component boundaries, data flow, trade-offs, scalability, and staged implementation."; break;
                case "debugging": modeInstruction = "Emphasize reproduction steps, evidence gathering, root-cause analysis, a minimal fix, and regression verification. Do not assume a cause."; break;
                case "code-review": modeInstruction = "Ask for an actionable review prioritized by severity across correctness, security, performance, and maintainability. Do not request implementation unless asked."; break;
                case "uiux": modeInstruction = "Emphasize user goals, layout, responsive behavior, accessibility, interaction states, and design consistency."; break;
                case "game": modeInstruction = "Emphasize gameplay goals, mechanics, controls, player feedback, assets, performance, and playtesting."; break;
                case "autonomous": modeInstruction = "Structure for an autonomous coding agent: inspect the repository, plan, implement the scoped change, run checks, and report actual results and risks."; break;
            }

            return "You are an expert prompt engineer. Improve the user's request so an AI assistant can execute it accurately. " +
                "Preserve intent; do not invent technologies, requirements, project facts, or results. " +
                "When project context is unknown, instruct the downstream assistant to inspect the project. " +
                "Keep the result proportionate and return only the enhanced prompt. Mode guidance: " + modeInstruction;
        }

        private static string ReadProviderError(Dictionary<string, object> payload)
        {
            object errorValue;
            if (payload == null || !payload.TryGetValue("error", out errorValue))
            {
                return String.Empty;
            }
            var error = errorValue as Dictionary<string, object>;
            object message;
            return error != null && error.TryGetValue("message", out message) ? Convert.ToString(message) : String.Empty;
        }

        private static string ReadCompletion(Dictionary<string, object> payload)
        {
            object choicesValue;
            if (payload == null || !payload.TryGetValue("choices", out choicesValue))
            {
                return String.Empty;
            }
            var choices = choicesValue as IList;
            var firstChoice = choices != null && choices.Count > 0 ? choices[0] as Dictionary<string, object> : null;
            object messageValue;
            var message = firstChoice != null && firstChoice.TryGetValue("message", out messageValue)
                ? messageValue as Dictionary<string, object>
                : null;
            object content;
            return message != null && message.TryGetValue("content", out content) ? Convert.ToString(content).Trim() : String.Empty;
        }

        private sealed class ModeOption
        {
            public ModeOption(string label, string value)
            {
                Label = label;
                Value = value;
            }

            public string Label { get; private set; }
            public string Value { get; private set; }

            public override string ToString()
            {
                return Label;
            }
        }
    }
}
