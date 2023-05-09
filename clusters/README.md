```shell
flux create source helm karpenter \
  --url oci://public.ecr.aws/karpenter/karpenter \
  --namespace karpenter \
  --export > ./clusters/karpenter/karpenter-source.yaml
```

```shell
flux create helmrelease karpenter --chart karpenter \
  --source HelmRepository/karpenter \
  --chart-version ${KARPENTER_VERSION} \
  --namespace karpenter \
  --export > ./clusters/karpenter/karpenter-deploy.yaml

```