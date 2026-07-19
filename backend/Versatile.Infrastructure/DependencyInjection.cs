using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenAI.Chat;
using Versatile.Application.Services;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<TenantSessionInterceptor>();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            var interceptor = sp.GetRequiredService<TenantSessionInterceptor>();
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection"))
                   .AddInterceptors(interceptor);
        }, ServiceLifetime.Scoped, ServiceLifetime.Scoped);

        services.AddScoped<DbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped(typeof(IUserOwnedRepository<>), typeof(UserOwnedRepository<>));
        services.AddScoped(typeof(IOrganizationOwnedRepository<>), typeof(OrganizationOwnedRepository<>));
        services.AddScoped<IOrganizationContext>(_ => new OrganizationContext());

        services.AddScoped<IAnnotationService, AnnotationService>();
        services.AddScoped<IAuthorProfileService, AuthorProfileService>();
        services.AddScoped<IBibleService, BibleService>();
        services.AddScoped<IChapterService, ChapterService>();
        services.AddScoped<ICharacterRelationshipService, CharacterRelationshipService>();
        services.AddScoped<IDailyGoalService, DailyGoalService>();
        services.AddScoped<IEntityService, EntityService>();
        services.AddScoped<IFlowService, FlowService>();
        services.AddScoped<IGraphEdgeService, GraphEdgeService>();
        services.AddScoped<IGraphGroupService, GraphGroupService>();
        services.AddScoped<IGroupEdgeService, GroupEdgeService>();
        services.AddScoped<IManuscriptService, ManuscriptService>();
        services.AddScoped<INodePositionService, NodePositionService>();
        services.AddScoped<IPlotThreadService, PlotThreadService>();
        services.AddScoped<IResearchChunkService, ResearchChunkService>();
        services.AddScoped<IResearchDocumentService, ResearchDocumentService>();
        services.AddScoped<IResearchService, ResearchService>();
        services.AddScoped<IResearchTagService, ResearchTagService>();
        services.AddScoped<IRevisionCommentService, RevisionCommentService>();
        services.AddScoped<ISceneService, SceneService>();
        services.AddScoped<ISessionArchiveItemService, SessionArchiveItemService>();
        services.AddScoped<ISnapshotService, SnapshotService>();
        services.AddScoped<ISnippetService, SnippetService>();
        services.AddScoped<ISparkHistoryItemService, SparkHistoryItemService>();
        services.AddScoped<IStoryDocumentService, StoryDocumentService>();
        services.AddScoped<IStoryElementService, StoryElementService>();
        services.AddScoped<IStoryService, StoryService>();
        services.AddScoped<IStoryStateSnapshotService, StoryStateSnapshotService>();
        services.AddScoped<IVoiceProfileService, VoiceProfileService>();
        services.AddScoped<IVolumeEntityService, VolumeEntityService>();

        services.AddMediatR(cfg =>
            cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly));

        var openAiKey = configuration["Ai:OpenAi:ApiKey"] ?? "";
        if (string.IsNullOrEmpty(openAiKey))
            throw new InvalidOperationException("Ai:OpenAi:ApiKey is not configured. Set Ai__OpenAi__ApiKey env var for production.");
        services.AddScoped(_ => new ChatClient("gpt-4o-mini", openAiKey));
        services.AddScoped<IChatStreamer, ChatClientStreamer>();
        services.AddScoped<KeyManagementService>();

        services.AddSingleton<IChatProviderFactory, AiProviderFactory>();
        services.AddScoped<TokenGenerator>();

        return services;
    }
}
